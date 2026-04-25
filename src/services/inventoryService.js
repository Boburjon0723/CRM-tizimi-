import { supabase } from '@/lib/supabase'
import {
    mergeProductInventoryRow,
    deriveInventoryStatusFromQty,
} from '@/lib/productInventoryMerge'
import {
    buildStockByColorMap,
    numStock,
    productHasColorVariants,
    resolveColorBucketKey,
    sumStockByColor,
} from '@/lib/stockByColor'

async function upsertProductInventory(productId, quantity, stockByColor) {
    const q = Math.max(0, Math.floor(Number(quantity) || 0))
    const { error } = await supabase.from('product_inventory').upsert(
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
 * Buyurtma tugallanganda (completed) mahsulotlarni ombordan ayirish.
 * Qoldiq `product_inventory` jadvalida.
 */
export async function deductStockForCompletedOrder(orderId, orderNumber, items) {
    if (!items || items.length === 0) return { success: true }

    const results = []
    const errors = []

    for (const item of items) {
        if (!item.product_id) continue

        try {
            const { data: raw, error: fetchError } = await supabase
                .from('products')
                .select('id, name, colors, color, product_inventory(quantity, stock_by_color)')
                .eq('id', item.product_id)
                .single()

            if (fetchError) throw fetchError

            const product = mergeProductInventoryRow(raw)

            const deductQty = Number(item.quantity) || 0
            if (deductQty <= 0) {
                results.push({ product_id: item.product_id, success: true, skipped: true })
                continue
            }

            const currentStock = numStock(product.stock)
            let newStock
            /** @type {Record<string, number>|undefined} */
            let newStockByColor
            let colorKeyResolved = null
            let reasonExtra = ''

            if (!productHasColorVariants(product)) {
                newStock = Math.max(0, currentStock - deductQty)
                const err = await upsertProductInventory(item.product_id, newStock, null)
                if (err) throw err
            } else {
                const bucketKey = resolveColorBucketKey(product, item.color)
                if (bucketKey) {
                    const map = buildStockByColorMap(product)
                    map[bucketKey] = Math.max(0, (Number(map[bucketKey]) || 0) - deductQty)
                    newStock = sumStockByColor(map)
                    newStockByColor = map
                    colorKeyResolved = bucketKey
                    const err = await upsertProductInventory(
                        item.product_id,
                        newStock,
                        newStockByColor
                    )
                    if (err) throw err
                } else {
                    newStock = Math.max(0, currentStock - deductQty)
                    reasonExtra =
                        ' [Rang mos kelmedi — faqat jami zaxira; stock_by_color o‘zgarmadi]'
                    const err = await upsertProductInventory(
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
                    change_amount: -deductQty,
                    previous_stock: currentStock,
                    new_stock: newStock,
                    reason: `Sotuv: Buyurtma №${orderNumber || orderId}${reasonExtra}`,
                    type: 'sale',
                    order_id: orderId,
                    color_key: colorKeyResolved,
                },
            ])

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
        errors,
    }
}

/**
 * Buyurtma holati 'completed' dan boshqasiga o‘zgarganda qoldiqni qaytarish.
 */
export async function reverseStockForOrder(orderId, orderNumber, items) {
    if (!items || items.length === 0) return { success: true }

    const results = []
    const errors = []

    for (const item of items) {
        if (!item.product_id) continue

        try {
            const { data: raw, error: fetchError } = await supabase
                .from('products')
                .select('id, colors, color, product_inventory(quantity, stock_by_color)')
                .eq('id', item.product_id)
                .single()

            if (fetchError) throw fetchError

            const product = mergeProductInventoryRow(raw)

            const returnQty = Number(item.quantity) || 0
            if (returnQty <= 0) {
                results.push({ product_id: item.product_id, success: true, skipped: true })
                continue
            }

            const currentStock = numStock(product.stock)
            let newStock
            /** @type {Record<string, number>|undefined} */
            let newStockByColor
            let colorKeyResolved = null
            let reasonExtra = ''

            if (!productHasColorVariants(product)) {
                newStock = currentStock + returnQty
                const err = await upsertProductInventory(item.product_id, newStock, null)
                if (err) throw err
            } else {
                const bucketKey = resolveColorBucketKey(product, item.color)
                if (bucketKey) {
                    const map = { ...buildStockByColorMap(product) }
                    map[bucketKey] = (Number(map[bucketKey]) || 0) + returnQty
                    newStock = sumStockByColor(map)
                    newStockByColor = map
                    colorKeyResolved = bucketKey
                    const err = await upsertProductInventory(
                        item.product_id,
                        newStock,
                        newStockByColor
                    )
                    if (err) throw err
                } else {
                    newStock = currentStock + returnQty
                    reasonExtra =
                        ' [Rang mos kelmedi — faqat jami zaxira qaytarildi; stock_by_color o‘zgarmadi]'
                    const err = await upsertProductInventory(
                        item.product_id,
                        newStock,
                        product.stock_by_color ?? null
                    )
                    if (err) throw err
                }
            }

            await supabase.from('stock_movements').insert([
                {
                    product_id: item.product_id,
                    change_amount: returnQty,
                    previous_stock: currentStock,
                    new_stock: newStock,
                    reason: `Qaytarish: Buyurtma №${orderNumber || orderId} (Holat o'zgardi)${reasonExtra}`,
                    type: 'reversal',
                    order_id: orderId,
                    color_key: colorKeyResolved,
                },
            ])

            results.push({ product_id: item.product_id, success: true })
        } catch (err) {
            errors.push({ product_id: item.product_id, error: err.message })
        }
    }

    return { success: errors.length === 0, results, errors }
}
