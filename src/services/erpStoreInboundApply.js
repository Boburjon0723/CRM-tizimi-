import { supabase } from '@/lib/supabase'
import {
    mergeErpStoreInventoryRow,
    deriveInventoryStatusFromQty,
} from '@/lib/productInventoryMerge'
import {
    buildStockByColorMap,
    numStock,
    productHasColorVariants,
    resolveColorBucketKey,
    sumStockByColor,
} from '@/lib/stockByColor'

async function upsertErpStoreInventory(productId, quantity, stockByColor) {
    const q = Math.max(0, Math.floor(Number(quantity) || 0))
    const { error } = await supabase.from('erp_store_inventory').upsert(
        {
            product_id: productId,
            quantity: q,
            stock_by_color: stockByColor ?? null,
            status: deriveInventoryStatusFromQty(q),
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
    )
    return error
}

/**
 * CRM buyurtma qatorlari → `erp_store_inventory` (do‘kon zaxirasi).
 */
export async function applyErpStoreInboundFromItems(orderId, orderNumber, items) {
    if (!items?.length) return { success: true, results: [], errors: [] }

    const results = []
    const errors = []

    for (const item of items) {
        if (!item.product_id) continue
        const addQty = Math.max(0, Math.floor(Number(item.quantity) || 0))
        if (addQty <= 0) {
            results.push({ product_id: item.product_id, success: true, skipped: true })
            continue
        }

        try {
            const { data: raw, error: fetchError } = await supabase
                .from('products')
                .select('id, name, colors, color, erp_store_inventory(quantity, stock_by_color)')
                .eq('id', item.product_id)
                .single()

            if (fetchError) throw fetchError

            const product = mergeErpStoreInventoryRow(raw)

            const currentStock = numStock(product.stock)
            let newStock
            let newStockByColor
            let colorKeyResolved = null
            let reasonExtra = ''

            if (!productHasColorVariants(product)) {
                newStock = currentStock + addQty
                const err = await upsertErpStoreInventory(item.product_id, newStock, null)
                if (err) throw err
            } else {
                const bucketKey = resolveColorBucketKey(product, item.color)
                if (bucketKey) {
                    const map = buildStockByColorMap(product)
                    map[bucketKey] = (Number(map[bucketKey]) || 0) + addQty
                    newStock = sumStockByColor(map)
                    newStockByColor = map
                    colorKeyResolved = bucketKey
                    const err = await upsertErpStoreInventory(
                        item.product_id,
                        newStock,
                        newStockByColor
                    )
                    if (err) throw err
                } else {
                    newStock = currentStock + addQty
                    reasonExtra = ' [Rang mos kelmedi — faqat jami zaxira oshirildi]'
                    const err = await upsertErpStoreInventory(
                        item.product_id,
                        newStock,
                        product.stock_by_color ?? null
                    )
                    if (err) throw err
                }
            }

            const { error: logError } = await supabase.from('stock_movements').insert([
                {
                    product_id: item.product_id,
                    change_amount: addQty,
                    previous_stock: currentStock,
                    new_stock: newStock,
                    reason: `ERP kirimi: CRM topshirig‘i №${orderNumber || orderId}${reasonExtra}`,
                    type: 'restock',
                    order_id: orderId,
                    color_key: colorKeyResolved,
                },
            ])

            if (logError) {
                console.warn('ERP kirim logi:', logError)
            }

            results.push({ product_id: item.product_id, success: true })
        } catch (err) {
            console.error('applyErpStoreInboundFromItems:', err)
            errors.push({ product_id: item.product_id, error: err.message })
        }
    }

    return {
        success: errors.length === 0,
        results,
        errors,
    }
}
