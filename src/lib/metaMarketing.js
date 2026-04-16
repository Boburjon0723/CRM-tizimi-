/**
 * Meta Marketing API (Graph API) — yordamchi funksiyalar.
 * Token hech qachon repoga yozilmaydi; chaqiruvchi uzatadi.
 *
 * Eslatma: CRM `output: 'export'` — server API yo‘q. Tokenni brauzerda saqlash
 * faqat ichki sinov uchun; prod uchun Supabase Edge Function yoki boshqa backend.
 */

export const META_GRAPH_API_VERSION = 'v21.0'

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

function buildUrl(path, accessToken, params = {}) {
    const p = path.startsWith('/') ? path : `/${path}`
    const u = new URL(`${GRAPH_BASE}${p}`)
    u.searchParams.set('access_token', accessToken)
    for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') u.searchParams.set(k, String(v))
    }
    return u.toString()
}

export async function metaGraphGet(path, accessToken, params = {}) {
    const res = await fetch(buildUrl(path, accessToken, params))
    const json = await res.json()
    if (json.error) {
        const err = new Error(json.error.message || 'Graph API xatolik')
        err.code = json.error.code
        err.status = res.status
        err.fb = json.error
        throw err
    }
    return json
}

/** Foydalanuvchi tokeni bo‘yicha reklama hisoblari */
export function listAdAccounts(accessToken) {
    return metaGraphGet('/me/adaccounts', accessToken, {
        fields: 'id,name,account_id,currency,account_status',
        limit: 50,
    })
}

/** Kampaniya bo‘yicha insights (kampaniya ID — raqam, `act_` emas) */
export function getCampaignInsights(accessToken, campaignId, { datePreset = 'last_7d', fields } = {}) {
    const defaultFields = 'impressions,clicks,spend,reach,cpc,cpm,actions'
    return metaGraphGet(`/${campaignId}/insights`, accessToken, {
        date_preset: datePreset,
        fields: fields || defaultFields,
    })
}

/** Lead form bo‘yicha leadlar (form ID Ads Manager / Graph dan) */
export function getLeadFormLeads(accessToken, formId, { fields } = {}) {
    const defaultFields = 'created_time,id,ad_id,form_id,field_data'
    return metaGraphGet(`/${formId}/leads`, accessToken, {
        fields: fields || defaultFields,
    })
}
