'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useState,
} from 'react'
import { createPortal } from 'react-dom'

const DIALOG_ROOT_ID = 'crm-dialog-portal-root'

function getDialogPortalNode() {
    if (typeof document === 'undefined') return null
    let el = document.getElementById(DIALOG_ROOT_ID)
    if (!el) {
        el = document.createElement('div')
        el.id = DIALOG_ROOT_ID
        el.setAttribute('data-portal', 'dialog')
        el.style.cssText = 'position:relative;z-index:2147483647;isolation:isolate;'
        document.body.appendChild(el)
    }
    return el
}
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

const DialogContext = createContext(null)

function ModalLayer({ modal }) {
    const { t } = useLanguage()

    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [])

    const isConfirm = modal.type === 'confirm'
    const variant = modal.variant || (isConfirm ? 'default' : 'info')

    const iconWrap =
        variant === 'error' ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <XCircle className="h-6 w-6" strokeWidth={2} />
            </div>
        ) : variant === 'warning' ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-6 w-6" strokeWidth={2} />
            </div>
        ) : variant === 'success' ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle className="h-6 w-6" strokeWidth={2} />
            </div>
        ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <Info className="h-6 w-6" strokeWidth={2} />
            </div>
        )

    const confirmBtnClass =
        variant === 'warning' || variant === 'error'
            ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'

    /** Ogohlantirish alertida «Tushundim» — ilova asosiy tugmasi bilan bir xil (sariq blok emas) */
    const alertOkBtnClass =
        variant === 'error'
            ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
            : variant === 'warning'
              ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
              : variant === 'success'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'

    const titleText =
        modal.title ||
        (isConfirm ? t('common.dialogConfirmTitle') : t('common.dialogAlertTitle'))

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
            style={{ zIndex: 2147483647 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
        >
            <button
                type="button"
                className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]"
                aria-label={t('common.close')}
                onClick={() => (isConfirm ? modal.onCancel() : modal.onClose())}
            />
            <div
                className="relative z-10 mx-auto shrink-0 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5"
                style={{ width: 'min(22rem, calc(100vw - 2rem))', maxWidth: '100%' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 p-4 sm:p-5 pb-3 sm:pb-4">
                    {iconWrap}
                    <div className="min-w-0 flex-1 pt-0.5 overflow-hidden">
                        <h2
                            id="app-dialog-title"
                            className="text-base sm:text-lg font-bold leading-snug text-gray-900 tracking-tight"
                        >
                            {titleText}
                        </h2>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-600">
                            {modal.message}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="-m-1 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        onClick={() => (isConfirm ? modal.onCancel() : modal.onClose())}
                        aria-label={t('common.close')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex flex-wrap items-stretch sm:items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/90 px-4 py-3 sm:px-5 sm:py-4">
                    {isConfirm ? (
                        <>
                            <button
                                type="button"
                                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 min-h-[44px]"
                                onClick={modal.onCancel}
                            >
                                {modal.cancelLabel || t('common.no')}
                            </button>
                            <button
                                type="button"
                                className={`rounded-xl px-4 py-2.5 text-sm font-bold min-h-[44px] ${confirmBtnClass}`}
                                onClick={modal.onConfirm}
                            >
                                {modal.confirmLabel || t('common.yes')}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold min-h-[44px] ${alertOkBtnClass}`}
                            onClick={modal.onClose}
                        >
                            {t('common.ok')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

function ToastStack({ items, onDismiss }) {
    return (
        <div
            className="pointer-events-none fixed top-4 right-4 flex max-w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
            style={{ zIndex: 2147483646 }}
            aria-live="polite"
        >
            {items.map((toast) => {
                const bar =
                    toast.type === 'error'
                        ? 'border-red-200 bg-red-50/95 text-red-900'
                        : toast.type === 'success'
                          ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                          : 'border-blue-200 bg-white/95 text-slate-800'
                return (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg ${bar}`}
                    >
                        <p className="min-w-0 flex-1 leading-snug">{toast.message}</p>
                        <button
                            type="button"
                            className="shrink-0 rounded-lg p-0.5 opacity-70 hover:opacity-100"
                            onClick={() => onDismiss(toast.id)}
                            aria-label="×"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}

export function DialogProvider({ children }) {
    const [modal, setModal] = useState(null)
    const [toasts, setToasts] = useState([])

    const showAlert = useCallback((message, options = {}) => {
        return new Promise((resolve) => {
            setModal({
                type: 'alert',
                title: options.title ?? null,
                message: String(message ?? ''),
                variant: options.variant ?? 'info',
                onClose: () => {
                    setModal(null)
                    resolve()
                },
            })
        })
    }, [])

    const showConfirm = useCallback((message, options = {}) => {
        return new Promise((resolve) => {
            setModal({
                type: 'confirm',
                title: options.title ?? null,
                message: String(message ?? ''),
                variant: options.variant ?? 'default',
                confirmLabel: options.confirmLabel,
                cancelLabel: options.cancelLabel,
                onConfirm: () => {
                    setModal(null)
                    resolve(true)
                },
                onCancel: () => {
                    setModal(null)
                    resolve(false)
                },
            })
        })
    }, [])

    const showToast = useCallback((message, options = {}) => {
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const duration = options.duration ?? 4500
        setToasts((prev) => [
            ...prev,
            { id, message: String(message ?? ''), type: options.type ?? 'info' },
        ])
        if (duration > 0) {
            window.setTimeout(() => {
                setToasts((prev) => prev.filter((x) => x.id !== id))
            }, duration)
        }
        return id
    }, [])

    useEffect(() => {
        if (!modal) return
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (modal.type === 'confirm') modal.onCancel()
                else modal.onClose()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [modal])

    const [portalEl, setPortalEl] = useState(null)
    useLayoutEffect(() => {
        setPortalEl(getDialogPortalNode())
    }, [])

    return (
        <DialogContext.Provider value={{ showAlert, showConfirm, showToast }}>
            {children}
            {portalEl && modal && createPortal(<ModalLayer modal={modal} />, portalEl)}
            {portalEl &&
                toasts.length > 0 &&
                createPortal(
                    <ToastStack
                        items={toasts}
                        onDismiss={(id) =>
                            setToasts((prev) => prev.filter((x) => x.id !== id))
                        }
                    />,
                    portalEl
                )}
        </DialogContext.Provider>
    )
}

export function useDialog() {
    const ctx = useContext(DialogContext)
    if (!ctx) {
        throw new Error('useDialog must be used within DialogProvider')
    }
    return ctx
}
