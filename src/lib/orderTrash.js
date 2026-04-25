/** PostgREST: `deleted_at` ustuni yo‘q yoki kesh yangilanmagan */
export function isDeletedAtMissingError(err) {
    const m = String(err?.message || err?.code || err || '')
    return /deleted_at|42703|PGRST204|schema cache|does not exist|column/i.test(m)
}
