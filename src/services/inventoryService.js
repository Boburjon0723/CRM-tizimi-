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
import { resolveMovementColorKey } from '@/lib/shipMovementColor'

async function insertStockMovementRow(row) {
    const first = await supabase.from('stock_movements').insert([row])
    if (!first.error) return null
    const m = String(first.error?.message || first.error?.code || '')
    if (/color_key|42703|PGRST204|schema cache|does not exist|column/i.test(m)) {
        const { color_key: _ck, ...rest } = row
        const fb = await supabase.from('stock_movements').insert([rest])
        return fb.error || null
    }
    return first.error
}

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
 * Buyurtma tugallanganda / qisman chiqimda ombordan ayirish.
 * Buyurtmadan ortiq chiqim yo‘q. Turli mahsulotlar parallel ishlaydi.
 */
export async function deductStockForCompletedOrder(orderId, orderNumber, items) {
    if (!items || items.length === 0) return { success: true }

    let toDeduct = items
    if (orderId) {
        try {
            const { clampShipItemsToOutstanding } = await import(
                '@/app/buyurtmalar/lib/partialShipUtils'
            )
            toDeduct = await clampShipItemsToOutstanding(orderId, items)
            if (!toDeduct.length) {
                return { success: true, results: [], errors: [], skipped: 'already_fully_shipped' }
            }
        } catch (e) {
            console.warn('clampShipItemsToOutstanding:', e?.message || e)
            toDeduct = items
        }
    }

    const byProduct = new Map()
    for (const item of toDeduct) {
        if (!item?.product_id) continue
        const pid = String(item.product_id)
        if (!byProduct.has(pid)) byProduct.set(pid, [])
        byProduct.get(pid).push(item)
    }

    const productIds = [...byProduct.keys()]
    const productById = new Map()
    const FETCH_CHUNK = 50
    for (let i = 0; i < productIds.length; i += FETCH_CHUNK) {
        const chunk = productIds.slice(i, i + FETCH_CHUNK)
        const { data, error } = await supabase
            .from('products')
            .select('id, name, colors, color, product_inventory(quantity, stock_by_color)')
            .in('id', chunk)
        if (error) {
            return {
                success: false,
                results: [],
                errors: [{ product_id: null, error: error.message }],
            }
        }
        for (const raw of data || []) {
            productById.set(String(raw.id), mergeProductInventoryRow(raw))
        }
    }

    const results = []
    const errors = []
    const CONCURRENCY = 8
    const entries = [...byProduct.entries()]
    let cursor = 0

    async function processProductGroup(productId, groupItems) {
        let product = productById.get(String(productId))
        if (!product) {
            errors.push({ product_id: productId, error: 'Mahsulot topilmadi' })
            return
        }

        for (const item of groupItems) {
            try {
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
                    product = { ...product, stock: newStock, stock_by_color: null }
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
                        product = { ...product, stock: newStock, stock_by_color: newStockByColor }
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
                        product = { ...product, stock: newStock }
                    }
                }

                const movementColorKey = resolveMovementColorKey(colorKeyResolved, item.color)
                const logError = await insertStockMovementRow({
                    product_id: item.product_id,
                    change_amount: -deductQty,
                    previous_stock: currentStock,
                    new_stock: newStock,
                    reason: `Sotuv: Buyurtma №${orderNumber || orderId}${reasonExtra}`,
                    type: 'sale',
                    order_id: orderId,
                    color_key: movementColorKey,
                })

                if (logError) {
                    throw new Error(
                        logError.message ||
                            `stock_movements yozilmadi (product ${item.product_id})`
                    )
                }

                results.push({
                    product_id: item.product_id,
                    success: true,
                    color_key: movementColorKey,
                    change_amount: -deductQty,
                })
            } catch (err) {
                console.error(`Failed to deduct stock for product ${item.product_id}:`, err)
                errors.push({ product_id: item.product_id, error: err.message })
            }
        }
    }

    async function worker() {
        while (cursor < entries.length) {
            const idx = cursor++
            const [pid, group] = entries[idx]
            await processProductGroup(pid, group)
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, Math.max(1, entries.length)) }, () => worker())
    )

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

            const movementColorKey = resolveMovementColorKey(colorKeyResolved, item.color)
            const logError = await insertStockMovementRow({
                product_id: item.product_id,
                change_amount: returnQty,
                previous_stock: currentStock,
                new_stock: newStock,
                reason: `Qaytarish: Buyurtma №${orderNumber || orderId} (Holat o'zgardi)${reasonExtra}`,
                type: 'reversal',
                order_id: orderId,
                color_key: movementColorKey,
            })
            if (logError) {
                throw new Error(
                    logError.message ||
                        `stock_movements yozilmadi (product ${item.product_id})`
                )
            }

            results.push({
                product_id: item.product_id,
                success: true,
                color_key: movementColorKey,
                change_amount: returnQty,
            })
        } catch (err) {
            errors.push({ product_id: item.product_id, error: err.message })
        }
    }

    return { success: errors.length === 0, results, errors }
}
