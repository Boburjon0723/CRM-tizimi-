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

/** Chiqib ketgan / tugallangan sana */
export function getCompletedOrderTimestamp(order) {
    const raw = order?.completed_at || order?.updated_at || order?.created_at || ''
    if (!raw) return null
    const t = new Date(raw).getTime()
    return Number.isNaN(t) ? null : t
}

export function shouldAutoArchiveCompletedOrder(order, nowMs = Date.now()) {
    if (!order || order.deleted_at || order.archived_at) return false
    if (!normalizeCompletedStatus(order.status)) return false
    const t = getCompletedOrderTimestamp(order)
    if (t == null) return false
    const ageMs = nowMs - t
    return ageMs >= COMPLETED_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000
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
    const { data, error } = await supabaseClient
        .from('orders')
        .select('id, status, completed_at, updated_at, created_at, deleted_at, archived_at')
        .not('deleted_at', 'is', null)
        .is('archived_at', null)
        .limit(500)

    if (error) {
        if (isDeletedAtMissingError(error) || isArchivedAtMissingError(error)) {
            return { migrated: 0, skipped: true }
        }
        console.warn('migrateCompletedFromTrashToArchive fetch:', error)
        return { migrated: 0 }
    }

    const toMove = (data || []).filter((o) => {
        if (!normalizeCompletedStatus(o.status)) return false
        // updated_at o‘chirishda yangilangan bo‘lishi mumkin — completed_at / created_at ishlatiladi
        const raw = o.completed_at || o.created_at
        if (!raw) return false
        const t = new Date(raw).getTime()
        if (Number.isNaN(t)) return false
        return Date.now() - t >= COMPLETED_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000
    })
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
