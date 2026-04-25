import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDeletedAtMissingError } from '@/lib/orderTrash'

/**
 * Dashboard uchun barcha statistika ma'lumotlarini kesh-lab olish.
 *
 * Foyda:
 * - Dashboard-ga har kirganingizda to'liq "loading" ko'rinmaydi,
 *   eski ma'lumot darhol ko'rsatiladi, orqafon yangilanadi.
 * - 4 ta alohida so'rov o'rniga bitta hook — kodni soddalashtiradi.
 */
export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const [productsCountRes, employeesRes, transactionsRes] = await Promise.all([
                supabase.from('products').select('id', { count: 'exact', head: true }),
                supabase.from('employees').select('id'),
                supabase.from('transactions').select('type, amount, date'),
            ])

            // PostgREST builder .is() dan keyin .catch() bo‘lmaydi — alohida await + fallback
            let ordersCountRes = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .is('deleted_at', null)

            let totalOrders = 0
            if (ordersCountRes.error && isDeletedAtMissingError(ordersCountRes.error)) {
                const fallback = await supabase.from('orders').select('id', { count: 'exact', head: true })
                totalOrders = fallback.count || 0
            } else {
                totalOrders = ordersCountRes.count || 0
            }

            const txData = transactionsRes.data || []
            const income = txData
                .filter((t) => t.type === 'income')
                .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
            const expense = txData
                .filter((t) => t.type === 'expense')
                .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

            return {
                mahsulotlar: productsCountRes.count ?? 0,
                xodimlar: employeesRes.data?.length || 0,
                buyurtmalar: totalOrders,
                foyda: income - expense,
                transactions: txData,
            }
        },
        staleTime: 2 * 60 * 1000, // 2 daqiqa keshda — dashboard tez ko'rinadi
    })
}

/**
 * So'nggi 5 ta buyurtma (dashboard yon paneli uchun).
 */
export function useRecentOrders() {
    return useQuery({
        queryKey: ['recent-orders'],
        queryFn: async () => {
            let res = await supabase
                .from('orders')
                .select('*, customers(name)')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(5)

            // deleted_at ustuni yo'q bo'lsa fallback
            if (res.error && isDeletedAtMissingError(res.error)) {
                res = await supabase
                    .from('orders')
                    .select('*, customers(name)')
                    .order('created_at', { ascending: false })
                    .limit(5)
            }

            if (res.error) throw res.error

            return (res.data || []).map((order) => ({
                id: order.id,
                mijoz: order.customers?.name || 'Mijoz',
                mahsulot: 'Order #' + order.id.toString().slice(0, 8),
                summa: order.total,
                status: order.status,
            }))
        },
        staleTime: 60 * 1000,
    })
}
