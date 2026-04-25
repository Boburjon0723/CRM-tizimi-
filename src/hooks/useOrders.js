import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchOrdersPageWithFallback, fetchDeletedOrdersPageWithFallback } from '@/app/buyurtmalar/utils'
import { isDeletedAtMissingError } from '@/lib/orderTrash'

// Query key konstantlari — bir joyda boshqarish osonroq
export const ORDERS_QUERY_KEY = ['orders']
export const TRASH_ORDERS_QUERY_KEY = ['orders', 'trash']
export const TRASH_COUNT_QUERY_KEY = ['orders', 'trash-count']

/**
 * Faol buyurtmalar ro'yxatini kesh-lab olish.
 * - Bir sahifadan ikkinchisiga o'tganda tezkor ko'rsatish (keshdan)
 * - Supabase realtime bilan birga: har qanday o'zgarishda invalidateQueries() chaqiriladi
 */
export function useOrders() {
    return useQuery({
        queryKey: ORDERS_QUERY_KEY,
        queryFn: async () => {
            const { data, error } = await fetchOrdersPageWithFallback({ activeOnly: true })
            if (error) throw error
            return data || []
        },
    })
}

/**
 * O'chirilgan (trash) buyurtmalar.
 * enabled: false — faqat kerak bo'lganda (trash ko'rinishida) yuboriladi
 */
export function useTrashOrders(enabled = false) {
    return useQuery({
        queryKey: TRASH_ORDERS_QUERY_KEY,
        queryFn: async () => {
            const { data, error } = await fetchDeletedOrdersPageWithFallback()
            if (error) throw error
            return data || []
        },
        enabled,
    })
}

/**
 * O'chirilgan buyurtmalar soni (badge uchun)
 */
export function useTrashOrderCount() {
    return useQuery({
        queryKey: TRASH_COUNT_QUERY_KEY,
        queryFn: async () => {
            const res = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .not('deleted_at', 'is', null)
            if (res.error && !isDeletedAtMissingError(res.error)) throw res.error
            return res.count ?? 0
        },
        staleTime: 30 * 1000, // 30 soniyada bir yangilansin
    })
}

/**
 * Buyurtmalar uchun barcha yordamchi ma'lumotlar (mijozlar, mahsulotlar, ranglar)
 */
export function useOrdersPageData() {
    return useQuery({
        queryKey: ['orders-page-data'],
        queryFn: async () => {
            const [customersRes, colorsRes] = await Promise.all([
                supabase.from('customers').select('id, name, phone').order('name'),
                supabase.from('product_colors').select('*').order('name'),
            ])

            let productsRes = await supabase
                .from('products')
                .select('*, categories(id, name, name_uz)')
                .order('name')

            if (productsRes.error) {
                productsRes = await supabase.from('products').select('*').order('name')
            }

            return {
                customers: customersRes.data || [],
                products: productsRes.data || [],
                productColors: colorsRes.data || [],
            }
        },
        staleTime: 5 * 60 * 1000, // Mijozlar va mahsulotlar 5 daqiqa keshda
    })
}

/**
 * Invalidation helper — yangi buyurtma saqlangandan keyin keshni yangilash
 */
export function useInvalidateOrders() {
    const queryClient = useQueryClient()
    return () => {
        queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })
        queryClient.invalidateQueries({ queryKey: TRASH_COUNT_QUERY_KEY })
    }
}
