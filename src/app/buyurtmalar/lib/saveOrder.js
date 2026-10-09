import { supabase } from '@/lib/supabase'
import { sendTelegramNotification } from '@/utils/telegram'
import { deductStockForCompletedOrder, reverseStockForOrder } from '@/services/inventoryService'
import { isDeletedAtMissingError, buildMergeSourceNote } from '@/lib/orderTrash'
import {
    getOutstandingItemsForDeduction,
    loadOrdersShippedMaps,
    orderItemShipKey,
} from './partialShipUtils'
import { removePartnerSaleForOrder } from './partnerSaleFromOrder'
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
    withCompletedAtOnStatusChange,
    normalizeStatusForSelect,
} from '../utils'

/**
 * Merge natijasi ombordan qayta ayirmasligi uchun: manba buyurtmalarda allaqachon
 * chiqim qilingan miqdorni yangi buyurtma qatorlaridan olib tashlaydi.
 * Manbalar to‘liq chiqib ketgan bo‘lsa — bo‘sh ro‘yxat qaytadi (ayirish yo‘q).
 */
async function subtractMergeSourceShipments(itemPayloads, mergeSourceOrderIds) {
    const srcIds = [...new Set((mergeSourceOrderIds || []).filter(Boolean))]
    if (srcIds.length < 2) return itemPayloads
    let shippedByKey
    try {
        const maps = await loadOrdersShippedMaps(srcIds)
        shippedByKey = new Map()
        for (const map of maps.values()) {
            for (const [key, qty] of map.entries()) {
                shippedByKey.set(key, (Number(shippedByKey.get(key)) || 0) + (Number(qty) || 0))
            }
        }
    } catch (e) {
        console.warn('subtractMergeSourceShipments:', e?.message || e)
        return itemPayloads
    }
    if (!shippedByKey.size) return itemPayloads

    const out = []
    for (const item of itemPayloads) {
        const key = orderItemShipKey(item.product_id, item.color || '—')
        const already = Number(shippedByKey.get(key)) || 0
        const qty = parseOrderItemQty(item.quantity || 0)
        if (already <= 0) {
            out.push(item)
            continue
        }
        shippedByKey.set(key, Math.max(0, already - qty))
        const left = Math.max(0, qty - already)
        if (left > 0) out.push({ ...item, quantity: left })
    }
    return out
}

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
    const isPartnerIdColumnMissing = (err) =>
        /partner_id/i.test(String(err?.message || '')) &&
        /column|does not exist|42703|schema cache/i.test(String(err?.message || ''))

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
    const stamp = new Date().toISOString()
    const statusNormalized =
        form.status === 'new' || form.status === 'Yangi'
            ? 'new'
            : form.status === 'pending' || form.status === 'Jarayonda'
              ? 'pending'
              : form.status === 'completed' || form.status === 'Tugallandi'
                ? 'completed'
                : form.status === 'cancelled' || form.status === 'Bekor qilindi'
                  ? 'cancelled'
                  : form.status
    const orderWorkspace = form.workspace === 'buyurtmalar2' ? 'buyurtmalar2' : 'legacy'
    const isWorkspaceMissingError = (err) =>
        /workspace/i.test(String(err?.message || err || '')) &&
        /column|does not exist|42703|schema cache/i.test(String(err?.message || err || ''))

    let baseOrderPayload = {
        customer_id: form.customer_id || null,
        customer_name: resolvedCustomerName,
        customer_phone: resolvedPhone,
        total: totalSum,
        status: statusNormalized,
        note: noteCombined,
        source: normalizeSourceForDb(form.source),
        updated_at: stamp,
        workspace: orderWorkspace,
        partner_id: form.partner_id || null,
    }
    baseOrderPayload = withCompletedAtOnStatusChange(
        baseOrderPayload,
        statusNormalized,
        oldStatus,
        stamp
    )
    // Yangi buyurtma darhol completed bo‘lsa — completed_at yoziladi
    if (!editId && normalizeStatusForSelect(statusNormalized) === 'completed' && !baseOrderPayload.completed_at) {
        baseOrderPayload.completed_at = stamp
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

        let updatePayload = { ...baseOrderPayload }
        let { error: updErr } = await supabase.from('orders').update(updatePayload).eq('id', orderIdStr)
        if (updErr && isPartnerIdColumnMissing(updErr)) {
            const { partner_id: _pid, ...noPartner } = updatePayload
            updatePayload = noPartner
            showToast(
                t('orders.partnerColumnMissing') ||
                    'Buyurtmachi bog‘lanmadi: orders.partner_id ustuni yo‘q. add_orders_partner_id.sql ni ishga tushiring.',
                { type: 'info' }
            )
            ;({ error: updErr } = await supabase.from('orders').update(updatePayload).eq('id', orderIdStr))
        }
        if (updErr && isWorkspaceMissingError(updErr)) {
            if (orderWorkspace === 'buyurtmalar2') {
                await showAlert(
                    t('orders2.workspaceMigrationHint') ||
                        'Buyurtmalar jadvalida `workspace` ustuni yo‘q. Supabase da `add_orders_workspace.sql` ni ishga tushiring.',
                    { variant: 'warning' }
                )
                return { ok: false }
            }
            const { workspace: _w, ...noWs } = updatePayload
            ;({ error: updErr } = await supabase.from('orders').update(noWs).eq('id', orderIdStr))
        }
        if (updErr && /completed_at|updated_at|column|does not exist|42703|schema cache/i.test(String(updErr.message || ''))) {
            // workspace ni olib tashlamang — faqat completed_at / updated_at
            const { completed_at: _c, updated_at: _u, ...rest } = updatePayload
            ;({ error: updErr } = await supabase.from('orders').update(rest).eq('id', orderIdStr))
            if (updErr && isWorkspaceMissingError(updErr) && orderWorkspace === 'legacy') {
                const { workspace: _w2, completed_at: _c2, updated_at: _u2, ...rest2 } = updatePayload
                ;({ error: updErr } = await supabase.from('orders').update(rest2).eq('id', orderIdStr))
            }
        }
        if (updErr) throw updErr

        const newStatus = baseOrderPayload.status
        const skipStock = orderWorkspace === 'buyurtmalar2'
        if (!skipStock && newStatus !== oldStatus) {
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
                try {
                    const removed = await removePartnerSaleForOrder(supabase, {
                        id: orderIdStr,
                        order_number: oldOrder?.order_number,
                    })
                    if (removed > 0) {
                        showToast(t('orders.partnerSaleRemoved') || 'Hamkor moliyasidagi sotuv yozuvi o‘chirildi', {
                            type: 'info',
                        })
                    }
                } catch (e) {
                    console.warn('removePartnerSaleForOrder:', e?.message || e)
                }
            }
        }

        return { ok: true }
    }

    let newOrder = null
    let includeWorkspace = true
    let includePartner = true

    const buildInsertRow = (stripKeys = []) => {
        const row = { ...baseOrderPayload, order_number: displayOrderNo }
        if (!includeWorkspace) delete row.workspace
        if (!includePartner) delete row.partner_id
        for (const k of stripKeys) delete row[k]
        return row
    }

    const failIfBuyurtmalar2NeedsWorkspace = async (err) => {
        if (orderWorkspace === 'buyurtmalar2' && isWorkspaceMissingError(err)) {
            await showAlert(
                t('orders2.workspaceMigrationHint') ||
                    'Buyurtmalar jadvalida `workspace` ustuni yo‘q. Supabase da `add_orders_workspace.sql` ni ishga tushiring.',
                { variant: 'warning' }
            )
            return true
        }
        return false
    }

    let ins = await supabase.from('orders').insert([buildInsertRow()]).select().single()

    if (ins.error && isWorkspaceMissingError(ins.error)) {
        if (await failIfBuyurtmalar2NeedsWorkspace(ins.error)) return { ok: false }
        includeWorkspace = false
        ins = await supabase.from('orders').insert([buildInsertRow()]).select().single()
    }

    if (
        ins.error &&
        /completed_at|updated_at/i.test(String(ins.error.message || '')) &&
        /column|does not exist|42703|schema cache/i.test(String(ins.error.message || ''))
    ) {
        ins = await supabase
            .from('orders')
            .insert([buildInsertRow(['completed_at', 'updated_at'])])
            .select()
            .single()
    }

    if (ins.error && isWorkspaceMissingError(ins.error)) {
        if (await failIfBuyurtmalar2NeedsWorkspace(ins.error)) return { ok: false }
        includeWorkspace = false
        ins = await supabase
            .from('orders')
            .insert([buildInsertRow(['completed_at', 'updated_at'])])
            .select()
            .single()
    }

    if (ins.error && isPartnerIdColumnMissing(ins.error)) {
        includePartner = false
        showToast(
            t('orders.partnerColumnMissing') ||
                'Buyurtmachi bog‘lanmadi: orders.partner_id ustuni yo‘q. add_orders_partner_id.sql ni ishga tushiring.',
            { type: 'info' }
        )
        ins = await supabase.from('orders').insert([buildInsertRow()]).select().single()
    }

    const errMsg2 = ins.error ? String(ins.error.message || '') : ''
    if (ins.error && /order_number/i.test(errMsg2) && /column|does not exist|schema cache/i.test(errMsg2)) {
        const row = buildInsertRow(['completed_at', 'updated_at', 'order_number'])
        row.note = `${t('orders.orderNumberPrefix')} ${displayOrderNo}\n${noteCombined || ''}`
        ins = await supabase.from('orders').insert([row]).select().single()
    } else if (
        ins.error &&
        !/completed_at|updated_at|workspace|order_number|column|does not exist|42703|schema cache/i.test(errMsg2)
    ) {
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

    if (baseOrderPayload.status === 'completed' && orderWorkspace !== 'buyurtmalar2') {
        const toDeduct = await subtractMergeSourceShipments(itemPayloads, mergeSourceOrderIds)
        if (toDeduct.length) {
            await deductStockForCompletedOrder(orderId, displayOrderNo, toDeduct)
            showToast(t('orders.stockDeductedOk') || "Ombor qoldig'i yangilandi", { type: 'success' })
        } else {
            showToast(
                t('orders.stockAlreadyDeducted') || 'Bu buyurtma bo‘yicha chiqim avval yozilgan',
                { type: 'info' }
            )
        }
    }

    const sourceIdsToArchive = mergeSourceOrderIds
    const shouldArchive = mergeArchiveSources ? sourceIdsToArchive : null
    if (shouldArchive?.length >= 2) {
        const ts = new Date().toISOString()
        const resultLabel = `№ ${newOrder?.order_number || displayOrderNo}`
        const { data: srcRows } = await supabase
            .from('orders')
            .select('id, note')
            .in('id', shouldArchive)
        const noteById = new Map((srcRows || []).map((r) => [String(r.id), r.note]))

        // Izohdagi belgi manbani karzinkada saqlaydi (arxivga chiqsa daromad ikki marta sanaladi)
        let archErr = null
        for (const srcId of shouldArchive) {
            const { error } = await supabase
                .from('orders')
                .update({
                    deleted_at: ts,
                    note: buildMergeSourceNote(noteById.get(String(srcId)), resultLabel),
                })
                .eq('id', srcId)
            if (error) {
                archErr = error
                break
            }
        }
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
