import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDeletedAtMissingError } from '@/lib/orderTrash'

function localYmd(d = new Date()) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function addDaysYmd(ymd, delta) {
    const [y, m, d] = ymd.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + delta)
    return localYmd(dt)
}

/**
 * Dashboard uchun barcha statistika ma'lumotlarini kesh-lab olish.
 */
export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const warnings = []

            // Mahsulotlar soni (count ishlamasa — fallback)
            let mahsulotlar = 0
            const productsCountRes = await supabase
                .from('products')
                .select('id', { count: 'exact', head: true })
            if (productsCountRes.error) {
                warnings.push(`products: ${productsCountRes.error.message}`)
                const fb = await supabase.from('products').select('id').limit(5000)
                if (fb.error) warnings.push(`products fallback: ${fb.error.message}`)
                else mahsulotlar = (fb.data || []).length
            } else {
                mahsulotlar = productsCountRes.count ?? 0
                if (mahsulotlar === 0) {
                    const fb = await supabase.from('products').select('id').limit(5000)
                    if (!fb.error && (fb.data || []).length > 0) {
                        mahsulotlar = fb.data.length
                    }
                }
            }

            const employeesRes = await supabase.from('employees').select('id')
            if (employeesRes.error) warnings.push(`employees: ${employeesRes.error.message}`)
            const xodimlar = employeesRes.data?.length || 0

            // Buyurtmalar soni
            let ordersCountRes = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .is('deleted_at', null)
                .neq('workspace', 'buyurtmalar2')

            let totalOrders = 0
            if (ordersCountRes.error && isDeletedAtMissingError(ordersCountRes.error)) {
                const fallback = await supabase
                    .from('orders')
                    .select('id', { count: 'exact', head: true })
                    .neq('workspace', 'buyurtmalar2')
                totalOrders = fallback.count || 0
            } else if (
                ordersCountRes.error &&
                /workspace|column|does not exist|42703|schema cache/i.test(
                    String(ordersCountRes.error.message || '')
                )
            ) {
                const fallback = await supabase
                    .from('orders')
                    .select('id', { count: 'exact', head: true })
                    .is('deleted_at', null)
                totalOrders = fallback.count || 0
            } else if (ordersCountRes.error) {
                warnings.push(`orders: ${ordersCountRes.error.message}`)
                totalOrders = 0
            } else {
                totalOrders = ordersCountRes.count || 0
            }

            // Eski moliya jadvali (chiqim uchun); kirim asosan buyurtmalardan
            const transactionsRes = await supabase.from('transactions').select('type, amount, date')
            if (transactionsRes.error) warnings.push(`transactions: ${transactionsRes.error.message}`)
            const txData = transactionsRes.data || []

            // So‘nggi 7 kun buyurtmalari — haftalik grafik «kirim»
            const today = localYmd()
            const from = addDaysYmd(today, -6)
            let weekOrdersRes = await supabase
                .from('orders')
                .select('id, total, created_at, status, deleted_at, workspace')
                .gte('created_at', `${from}T00:00:00`)
                .order('created_at', { ascending: false })
                .limit(2000)

            if (weekOrdersRes.error) {
                warnings.push(`week orders: ${weekOrdersRes.error.message}`)
                weekOrdersRes = { data: [], error: weekOrdersRes.error }
            }

            const weekOrders = (weekOrdersRes.data || []).filter((o) => {
                if (o.deleted_at) return false
                if (o.workspace === 'buyurtmalar2') return false
                const st = String(o.status || '').toLowerCase()
                if (st.includes('cancel') || st.includes('bekor')) return false
                return true
            })

            const orderIncomeByDay = {}
            let weekOrderIncome = 0
            for (const o of weekOrders) {
                const day = String(o.created_at || '').slice(0, 10)
                if (!day) continue
                const amt = Number(o.total) || 0
                orderIncomeByDay[day] = (orderIncomeByDay[day] || 0) + amt
                weekOrderIncome += amt
            }

            const txIncome = txData
                .filter((t) => t.type === 'income')
                .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
            const txExpense = txData
                .filter((t) => t.type === 'expense')
                .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

            // Foyda: buyurtmalar jami (aktiv) − moliya chiqimlari (taxminiy ko‘rsatkich)
            let allOrdersSumRes = await supabase
                .from('orders')
                .select('total, status, deleted_at, workspace')
                .limit(5000)
            if (allOrdersSumRes.error) {
                warnings.push(`orders sum: ${allOrdersSumRes.error.message}`)
                allOrdersSumRes = { data: [] }
            }
            const ordersRevenue = (allOrdersSumRes.data || [])
                .filter((o) => {
                    if (o.deleted_at) return false
                    if (o.workspace === 'buyurtmalar2') return false
                    const st = String(o.status || '').toLowerCase()
                    if (st.includes('cancel') || st.includes('bekor')) return false
                    return true
                })
                .reduce((s, o) => s + (Number(o.total) || 0), 0)

            return {
                mahsulotlar,
                xodimlar,
                buyurtmalar: totalOrders,
                foyda: ordersRevenue - txExpense,
                transactions: txData,
                orderIncomeByDay,
                weekOrderIncome,
                txIncome,
                txExpense,
                warnings,
            }
        },
        staleTime: 2 * 60 * 1000,
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
                .neq('workspace', 'buyurtmalar2')
                .order('created_at', { ascending: false })
                .limit(5)

            if (res.error && isDeletedAtMissingError(res.error)) {
                res = await supabase
                    .from('orders')
                    .select('*, customers(name)')
                    .neq('workspace', 'buyurtmalar2')
                    .order('created_at', { ascending: false })
                    .limit(5)
            }

            if (
                res.error &&
                /workspace|column|does not exist|42703|schema cache/i.test(String(res.error.message || ''))
            ) {
                res = await supabase
                    .from('orders')
                    .select('*, customers(name)')
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false })
                    .limit(5)
            }

            if (res.error) throw res.error

            return (res.data || []).map((order) => {
                const isV2 = order.workspace === 'buyurtmalar2'
                const statusRaw = String(order.status || '').toLowerCase()
                let statusLabel = order.status
                if (statusRaw === 'new' || statusRaw === 'yangi') statusLabel = 'Yangi'
                else if (statusRaw === 'pending' || statusRaw === 'jarayonda') statusLabel = 'Jarayonda'
                else if (statusRaw === 'completed' || statusRaw === 'yakunlangan') statusLabel = 'Tugallandi'
                else if (statusRaw === 'cancelled' || statusRaw === 'bekor_qilingan') statusLabel = 'Bekor'

                return {
                    id: order.id,
                    mijoz: order.customers?.name || order.customer_name || 'Mijoz',
                    mahsulot: (isV2 ? 'B2 #' : 'Order #') + String(order.id).slice(0, 8),
                    summa: order.total,
                    status: statusLabel,
                    href: isV2
                        ? `/buyurtmalar2?highlight=${encodeURIComponent(String(order.id))}`
                        : `/buyurtmalar?highlight=${encodeURIComponent(String(order.id))}`,
                    workspace: order.workspace || 'legacy',
                }
            })
        },
        staleTime: 60 * 1000,
    })
}
