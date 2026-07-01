import { supabase } from '@/lib/supabase'
import { sendTelegramNotification } from '@/utils/telegram'
import { deductStockForCompletedOrder, reverseStockForOrder } from '@/services/inventoryService'
import { isDeletedAtMissingError } from '@/lib/orderTrash'
import { getOutstandingItemsForDeduction } from './partialShipUtils'
import {
    parseOrderItemQty,
    expandOrderLineForSubmit,
    LS_LAST_ORDER,
    clearNewOrderDraft,
    generateDisplayOrderNumber,
    displayProductName,
    mergeExpandedRowsForSubmit,
    mergeOrderItemPayloadsForDb,
    normalizeSourceForDb,
} from '../utils'

export async function saveOrder({
    form,
    orderLines,
    editId,
    orders,
    products,
    customers,
    mergeSourceAgg,
    mergeSourceOrderIds,
    mergeArchiveSources,
    t,
    showAlert,
    showToast,
    onMergeArchived,
    loadTrashOrders,
}) {
    const nameTrim = (form.customer_name || '').trim()
    if (!nameTrim) {
        await showAlert(t('orders.customerNameRequired'), { variant: 'warning' })
        return { ok: false }
    }

    const oldOrder = editId ? orders.find((o) => String(o.id) === String(editId)) : null
    const oldStatus = oldOrder?.status || null

    const customer = form.customer_id ? customers.find((c) => c.id === form.customer_id) : null
    const resolvedCustomerName = nameTrim || customer?.name || ''
    const resolvedPhone = (form.customer_phone || '').trim() || customer?.phone || ''

    const linesForSave = orderLines.map((l) => (l.product_id ? { ...l, readyForSort: true } : l))

    const unresolvedFetch = orderLines.filter((l) => (l.codeInput || '').trim() && !l.product_id)
    if (unresolvedFetch.length) {
        await showAlert(t('orders.orderLinesUnresolved'), { variant: 'warning' })
        return { ok: false }
    }

    const expandedRows = mergeExpandedRowsForSubmit(linesForSave.flatMap(expandOrderLineForSubmit), products)
    if (expandedRows.length === 0) {
        await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
        return { ok: false }
    }

    const computedTotal =
        Math.round(
            expandedRows.reduce((s, row) => {
                const acc = Number(s) || 0
                const pr = Number(row.product_price) || 0
                const q = parseOrderItemQty(row.quantity ?? '0')
                return acc + pr * q
            }, 0) * 100
        ) / 100
    const totalSum = mergeSourceAgg != null ? mergeSourceAgg.subtotal : computedTotal

    const noteCombined = (form.note || '').trim()
    const displayOrderNo = generateDisplayOrderNumber()
    const baseOrderPayload = {
        customer_id: form.customer_id || null,
        customer_name: resolvedCustomerName,
        customer_phone: resolvedPhone,
        total: totalSum,
        status:
            form.status === 'new' || form.status === 'Yangi'
                ? 'new'
                : form.status === 'pending' || form.status === 'Jarayonda'
                  ? 'pending'
                  : form.status === 'completed' || form.status === 'Tugallandi'
                    ? 'completed'
                    : form.status === 'cancelled' || form.status === 'Bekor qilindi'
                      ? 'cancelled'
                      : form.status,
        note: noteCombined,
        source: normalizeSourceForDb(form.source),
    }

    const sourceLineIndexMap = new Map()
    const makeItemPayloads = (orderId) =>
        expandedRows.map((line, idx) => {
            const sourceLineKeyRaw =
                line.source_line_id != null && String(line.source_line_id).trim() !== ''
                    ? String(line.source_line_id).trim()
                    : `row_${idx}`
            if (!sourceLineIndexMap.has(sourceLineKeyRaw)) {
                sourceLineIndexMap.set(sourceLineKeyRaw, sourceLineIndexMap.size)
            }
            const prod = products.find((p) => String(p.id) === String(line.product_id))
            const qtyRaw = parseOrderItemQty(line.quantity)
            const qty = qtyRaw > 0 ? qtyRaw : 1
            const rawPrice = Number(line.product_price)
            const pr = Number.isFinite(rawPrice) ? Math.round(rawPrice * 100) / 100 : 0
            const subtotal = Math.round(pr * qty * 100) / 100
            const colorVal = line.color ?? prod?.color
            const imgVal =
                line.image_url != null && String(line.image_url).trim() !== ''
                    ? String(line.image_url).trim()
                    : prod?.image_url != null && String(prod.image_url).trim() !== ''
                      ? String(prod.image_url).trim()
                      : null
            const sizeForDb =
                line.codeInput != null && String(line.codeInput).trim() !== ''
                    ? String(line.codeInput).trim()
                    : prod?.size != null && String(prod.size).trim() !== ''
                      ? String(prod.size).trim()
                      : null
            const lineNoteDb =
                line.line_note != null && String(line.line_note).trim() !== ''
                    ? String(line.line_note).trim()
                    : null
            return {
                order_id: orderId,
                product_id: line.product_id,
                product_name: (line.product_name || displayProductName(prod) || '').trim() || 'Mahsulot',
                quantity: qty,
                price: pr,
                subtotal,
                size: sizeForDb,
                color: colorVal != null && colorVal !== '' ? String(colorVal) : null,
                image_url: imgVal != null && imgVal !== '' ? String(imgVal) : null,
                line_note: lineNoteDb,
                __separateKey:
                    line.source_line_id != null && String(line.source_line_id).trim() !== ''
                        ? String(line.source_line_id).trim()
                        : '',
                line_index: sourceLineIndexMap.get(sourceLineKeyRaw) ?? idx,
            }
        })

    if (editId) {
        const orderIdStr = String(editId)
        const itemPayloadsEdit = mergeOrderItemPayloadsForDb(makeItemPayloads(orderIdStr), products)
        if (!itemPayloadsEdit.length) {
            await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
            return { ok: false }
        }

        const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', orderIdStr)
        if (delErr) throw delErr

        const { error: itemErrorEdit } = await supabase.from('order_items').insert(itemPayloadsEdit)
        if (itemErrorEdit) throw itemErrorEdit

        const { error: updErr } = await supabase.from('orders').update(baseOrderPayload).eq('id', orderIdStr)
        if (updErr) throw updErr

        const newStatus = baseOrderPayload.status
        if (newStatus !== oldStatus) {
            const items = itemPayloadsEdit
            const num = oldOrder?.order_number || orderIdStr
            if (newStatus === 'completed') {
                const outstanding = await getOutstandingItemsForDeduction(orderIdStr, items)
                if (outstanding.length > 0) {
                    await deductStockForCompletedOrder(orderIdStr, num, outstanding)
                    showToast(t('orders.stockDeductedOk') || "Ombor qoldig'i yangilandi", { type: 'success' })
                } else {
                    showToast(t('orders.stockAlreadyDeducted') || 'Bu buyurtma bo‘yicha chiqim avval yozilgan', {
                        type: 'info',
                    })
                }
            } else if (oldStatus === 'completed') {
                await reverseStockForOrder(orderIdStr, num, items)
                showToast(t('orders.stockReversedOk') || "Ombor qoldig'i qaytarildi", { type: 'info' })
            }
        }

        return { ok: true }
    }

    let newOrder = null
    let ins = await supabase
        .from('orders')
        .insert([{ ...baseOrderPayload, order_number: displayOrderNo }])
        .select()
        .single()

    const errMsg = ins.error ? String(ins.error.message || ins.error) : ''
    if (ins.error && /order_number|column.*does not exist|schema cache/i.test(errMsg)) {
        ins = await supabase
            .from('orders')
            .insert([
                {
                    ...baseOrderPayload,
                    note: `${t('orders.orderNumberPrefix')} ${displayOrderNo}\n${noteCombined || ''}`,
                },
            ])
            .select()
            .single()
    } else if (ins.error) {
        throw ins.error
    }
    if (ins.error) throw ins.error
    newOrder = ins.data

    try {
        const snap = {
            customer_name: form.customer_name,
            customer_phone: form.customer_phone,
            customer_id: form.customer_id,
            lines: linesForSave
                .filter((l) => l.product_id)
                .map((l) => ({
                    codeInput: l.codeInput,
                    quantity: l.quantity,
                    product_id: l.product_id,
                    product_name: l.product_name,
                    product_price: l.product_price,
                    color: l.color,
                    image_url: l.image_url,
                    colorChoices: l.colorChoices || [],
                    colorQtyByColor: l.colorQtyByColor || {},
                    local_note: l.local_note || '',
                })),
        }
        localStorage.setItem(LS_LAST_ORDER, JSON.stringify(snap))
    } catch (e) {
        console.warn('localStorage', e)
    }

    const orderId = newOrder.id
    const itemPayloads = mergeOrderItemPayloadsForDb(makeItemPayloads(orderId), products)
    if (!itemPayloads.length) {
        await supabase.from('orders').delete().eq('id', orderId)
        await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
        return { ok: false }
    }

    const { error: itemError } = await supabase.from('order_items').insert(itemPayloads)
    if (itemError) {
        await supabase.from('orders').delete().eq('id', orderId)
        throw itemError
    }

    if (baseOrderPayload.status === 'completed') {
        await deductStockForCompletedOrder(orderId, displayOrderNo, itemPayloads)
        showToast(t('orders.stockDeductedOk') || "Ombor qoldig'i yangilandi", { type: 'success' })
    }

    const sourceIdsToArchive = mergeSourceOrderIds
    const shouldArchive = mergeArchiveSources ? sourceIdsToArchive : null
    if (shouldArchive?.length >= 2) {
        const ts = new Date().toISOString()
        const { error: archErr } = await supabase
            .from('orders')
            .update({ deleted_at: ts })
            .in('id', shouldArchive)
        if (archErr) {
            if (isDeletedAtMissingError(archErr)) {
                await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
            } else {
                await showAlert(archErr.message || String(archErr), {
                    title: t('common.saveError'),
                    variant: 'error',
                })
            }
        } else {
            onMergeArchived?.(shouldArchive)
            showToast(t('orders.mergeArchiveSourcesDone'), { type: 'success' })
            await loadTrashOrders?.()
        }
    }

    try {
        const num = newOrder?.order_number || displayOrderNo
        const message = `🛍 Yangi Buyurtma\n№ ${num}\n\n👤 Mijoz: ${resolvedCustomerName}\n📞 ${resolvedPhone || '—'}\n💰 Summa: $${totalSum}`
        await sendTelegramNotification(message)
    } catch (tgErr) {
        console.warn('Telegram:', tgErr)
    }

    clearNewOrderDraft()
    return { ok: true }
}
