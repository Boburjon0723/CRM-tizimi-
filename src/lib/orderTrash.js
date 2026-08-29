/** PostgREST: `deleted_at` ustuni yo‘q yoki kesh yangilanmagan */
export function isDeletedAtMissingError(err) {
    const m = String(err?.message || err?.code || err || '')
    return /deleted_at|42703|PGRST204|schema cache|does not exist|column/i.test(m)
}

export function isArchivedAtMissingError(err) {
    const m = String(err?.message || err?.code || err || '')
    return /archived_at|42703|PGRST204|schema cache|does not exist|column/i.test(m)
}

/** Tugallangan buyurtma shuncha kundan keyin alohida ARXIVga o‘tadi (korzinka emas) */
export const COMPLETED_ARCHIVE_AFTER_DAYS = 30

function normalizeCompletedStatus(status) {
    if (status == null || status === '') return false
    const s = String(status).toLowerCase().trim()
    return (
        s === 'completed' ||
        s === 'tugallandi' ||
        s === 'tugallangan' ||
        s.includes('tugallan')
    )
}

/**
 * Chiqib ketgan / tugallangan sana — arxiv muddati shu sanadan.
 * Tartib: completed_at → updated_at (agar ustun bo‘lsa) → created_at (legacy fallback).
 * Bazada ko‘p buyurtmada completed_at bo‘sh; updated_at ustuni ham yo‘q — shuning uchun created_at.
 */
export function getCompletedOrderTimestamp(order) {
    const raw = order?.completed_at || order?.updated_at || order?.created_at || ''
    if (!raw) return null
    const t = new Date(raw).getTime()
    return Number.isNaN(t) ? null : t
}

/**
 * Merge natijasi manba buyurtmasining izohiga qo‘yiladigan belgi.
 * Manba karzinkada qolishi shart — aks holda «Jami daromad» merge natijasi
 * bilan birga ikki marta sanaladi.
 */
export const MERGE_SOURCE_NOTE_PREFIX = 'Birlashtirildi →'

export function buildMergeSourceNote(existingNote, resultOrderLabel) {
    const base = String(existingNote || '').trim()
    const mark = `${MERGE_SOURCE_NOTE_PREFIX} ${resultOrderLabel}`
    if (isMergeSourceOrder({ note: base })) return base
    return base ? `${base}\n${mark}` : mark
}

export function isMergeSourceOrder(order) {
    return /Birlashtirildi\s*(→|->)/i.test(String(order?.note || ''))
}

/** Merge natijasi (izohida birlashtirilgan buyurtmalar ro‘yxati bor) */
export function isMergeResultOrder(order) {
    return /Birlashtirilgan buyurtmalar/i.test(String(order?.note || ''))
}

/**
 * Merge bilan bog‘liq (natija yoki manba) buyurtma karzinkaga tushgan bo‘lsa —
 * bu ataylab qilingan: bir xil summa ikki marta sanalmasligi uchun. Avtomatik
 * «karzinka → arxiv» ko‘chirishi bunday buyurtmani qaytarib chiqarmasligi kerak.
 */
export function isMergeRelatedOrder(order) {
    return isMergeSourceOrder(order) || isMergeResultOrder(order)
}

export function shouldAutoArchiveCompletedOrder(order, nowMs = Date.now()) {
    if (!order || order.deleted_at || order.archived_at) return false
    if (!normalizeCompletedStatus(order.status)) return false
    const t = getCompletedOrderTimestamp(order)
    if (t == null) return false
    const ageMs = nowMs - t
    return ageMs >= COMPLETED_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/** Korzinkadagi eski tugallangan — arxivga ko‘chirish sharti */
export function shouldMigrateCompletedTrashToArchive(order, nowMs = Date.now()) {
    if (!order?.deleted_at || order.archived_at) return false
    if (!normalizeCompletedStatus(order.status)) return false
    // Merge bilan bog‘liq karzinka buyurtmasi joyida qoladi — arxivga chiqsa daromad ikki marta sanaladi
    if (isMergeRelatedOrder(order)) return false
    const t = getCompletedOrderTimestamp(order)
    if (t == null) return false
    return nowMs - t >= COMPLETED_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * 1 oydan eski tugallanganlarni ARXIVga o‘tkazadi (`archived_at`).
 * Korzinka (`deleted_at`) ga tegmaydi.
 */
export async function archiveStaleCompletedOrders(supabaseClient, ordersList) {
    const ids = (ordersList || [])
        .filter((o) => shouldAutoArchiveCompletedOrder(o))
        .map((o) => o.id)
        .filter(Boolean)
    if (!ids.length) return { archived: 0, ids: [] }

    const ts = new Date().toISOString()
    const CHUNK = 40
    const archivedIds = []
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const { error } = await supabaseClient
            .from('orders')
            .update({ archived_at: ts })
            .in('id', chunk)
        if (error) {
            if (isArchivedAtMissingError(error)) return { archived: 0, ids: [], skipped: true }
            console.warn('archiveStaleCompletedOrders:', error)
            break
        }
        archivedIds.push(...chunk)
    }
    return { archived: archivedIds.length, ids: archivedIds }
}

/**
 * Avvalgi xato: tugallanganlar `deleted_at` (korzinka) ga tushgan bo‘lsa —
 * ularni arxivga ko‘chirish (`archived_at`, `deleted_at` = null).
 */
export async function migrateCompletedFromTrashToArchive(supabaseClient) {
    let data = null
    let error = null
    // updated_at ba’zi bazalarda yo‘q — avval to‘liq select, xato bo‘lsa soddalashtirilgan
    ;({ data, error } = await supabaseClient
        .from('orders')
        .select('id, status, note, completed_at, created_at, deleted_at, archived_at')
        .not('deleted_at', 'is', null)
        .is('archived_at', null)
        .limit(1000))

    if (error) {
        if (isDeletedAtMissingError(error) || isArchivedAtMissingError(error)) {
            return { migrated: 0, skipped: true }
        }
        console.warn('migrateCompletedFromTrashToArchive fetch:', error)
        return { migrated: 0 }
    }

    const toMove = (data || []).filter((o) => shouldMigrateCompletedTrashToArchive(o))
    if (!toMove.length) return { migrated: 0 }

    const ids = toMove.map((o) => o.id)
    const ts = new Date().toISOString()
    let migrated = 0
    const CHUNK = 40
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const { error: updErr } = await supabaseClient
            .from('orders')
            .update({ archived_at: ts, deleted_at: null })
            .in('id', chunk)
        if (updErr) {
            if (isArchivedAtMissingError(updErr)) return { migrated: 0, skipped: true }
            console.warn('migrateCompletedFromTrashToArchive update:', updErr)
            break
        }
        migrated += chunk.length
    }
    return { migrated }
}
