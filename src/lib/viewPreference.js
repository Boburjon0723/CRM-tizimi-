/** Mobil / kompyuter versiya tanlovi (localStorage). */

export const VIEW_PREF_KEY = 'crm_prefer_desktop'

export const DESKTOP_VIEWPORT_WIDTH = 1280

export function prefersDesktopView() {
    if (typeof window === 'undefined') return false
    try {
        return window.localStorage.getItem(VIEW_PREF_KEY) === '1'
    } catch {
        return false
    }
}

export function setPreferDesktopView(enabled) {
    if (typeof window === 'undefined') return
    try {
        if (enabled) {
            window.localStorage.setItem(VIEW_PREF_KEY, '1')
        } else {
            window.localStorage.removeItem(VIEW_PREF_KEY)
        }
    } catch {
        /* ignore quota / private mode */
    }
}

/**
 * Telefon ekranida ham desktop layout (md/lg breakpoint) ochilishi uchun
 * viewport meta va min-width ni sozlaydi.
 */
export function applyDesktopViewport(enabled) {
    if (typeof document === 'undefined') return

    let meta = document.querySelector('meta[name="viewport"]')
    if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'viewport')
        document.head.appendChild(meta)
    }

    if (enabled) {
        const screenW = window.innerWidth || DESKTOP_VIEWPORT_WIDTH
        const scale = Math.max(0.2, Math.min(1, screenW / DESKTOP_VIEWPORT_WIDTH))
        meta.setAttribute(
            'content',
            `width=${DESKTOP_VIEWPORT_WIDTH}, initial-scale=${scale.toFixed(3)}, minimum-scale=0.1, maximum-scale=5, user-scalable=yes`
        )
        document.documentElement.classList.add('crm-desktop-forced')
        document.body?.classList.add('crm-desktop-forced')
    } else {
        meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes')
        document.documentElement.classList.remove('crm-desktop-forced')
        document.body?.classList.remove('crm-desktop-forced')
    }
}

export function goToDesktopSite() {
    setPreferDesktopView(true)
    applyDesktopViewport(true)
    window.location.replace('/')
}

export function goToMobileSite() {
    setPreferDesktopView(false)
    applyDesktopViewport(false)
    window.location.replace('/mobile')
}
