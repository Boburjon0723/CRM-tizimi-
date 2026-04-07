import { supabase } from '@/lib/supabase'

/**
 * Buyurtma tugallanganda (completed) mahsulotlarni ombordan ayirish.
 * @param {string} orderId - Buyurtma ID raqami (loglash uchun)
 * @param {string} orderNumber - Buyurtma ko'rinishidagi raqami (loglash uchun)
 * @param {Array} items - Order items ro'yxati {product_id, quantity, product_name}
 */
export async function deductStockForCompletedOrder(orderId, orderNumber, items) {
    if (!items || items.length === 0) return { success: true }

    const results = []
    const errors = []

    for (const item of items) {
        if (!item.product_id) continue

        try {
            // 1. Joriy qoldiqni olish
            const { data: product, error: fetchError } = await supabase
                .from('products')
                .select('stock, name')
                .eq('id', item.product_id)
                .single()

            if (fetchError) throw fetchError

            const currentStock = Number(product.stock) || 0
            const deductQty = Number(item.quantity) || 0
            const newStock = currentStock - deductQty

            // 2. Qoldiqni yangilash
            const { error: updateError } = await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', item.product_id)

            if (updateError) throw updateError

            // 3. Harakatni loglash (stock_movements)
            // Izoh: stock_movements jadvali create_stock_movements.sql da yaratilgan
            const { error: logError } = await supabase
                .from('stock_movements')
                .insert([{
                    product_id: item.product_id,
                    change_amount: -deductQty,
                    previous_stock: currentStock,
                    new_stock: newStock,
                    reason: `Sotuv: Buyurtma №${orderNumber || orderId}`,
                    type: 'sale'
                }])

            if (logError) {
                console.warn(`Stock movement log failed for product ${item.product_id}:`, logError)
            }

            results.push({ product_id: item.product_id, success: true })
        } catch (err) {
            console.error(`Failed to deduct stock for product ${item.product_id}:`, err)
            errors.push({ product_id: item.product_id, error: err.message })
        }
    }

    return {
        success: errors.length === 0,
        results,
        errors
    }
}

/**
 * Buyurtma holati 'completed' dan boshqasiga o'zgarganda qoldiqni qaytarish (Reversal).
 * @param {string} orderId 
 * @param {string} orderNumber 
 * @param {Array} items 
 */
export async function reverseStockForOrder(orderId, orderNumber, items) {
    if (!items || items.length === 0) return { success: true }

    const results = []
    const errors = []

    for (const item of items) {
        if (!item.product_id) continue

        try {
            const { data: product, error: fetchError } = await supabase
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .single()

            if (fetchError) throw fetchError

            const currentStock = Number(product.stock) || 0
            const returnQty = Number(item.quantity) || 0
            const newStock = currentStock + returnQty

            await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', item.product_id)

            await supabase
                .from('stock_movements')
                .insert([{
                    product_id: item.product_id,
                    change_amount: returnQty,
                    previous_stock: currentStock,
                    new_stock: newStock,
                    reason: `Qaytarish: Buyurtma №${orderNumber || orderId} (Holat o'zgardi)`,
                    type: 'reversal'
                }])

            results.push({ product_id: item.product_id, success: true })
        } catch (err) {
            errors.push({ product_id: item.product_id, error: err.message })
        }
    }

    return { success: errors.length === 0, results, errors }
}
