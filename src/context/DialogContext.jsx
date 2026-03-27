'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react'
import { createPortal } from 'react-dom'
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

    const titleText =
        modal.title ||
        (isConfirm ? t('common.dialogConfirmTitle') : t('common.dialogAlertTitle'))

    return (
        <div
            className="fixed inset-0 z-[10001] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
        >
            <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label={t('common.close')}
                onClick={() => (isConfirm ? modal.onCancel() : modal.onClose())}
            />
            <div
                className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl shadow-slate-900/15"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-4 p-5 sm:p-6">
                    {iconWrap}
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h2
                            id="app-dialog-title"
                            className="text-lg font-bold leading-snug text-gray-900"
                        >
                            {titleText}
                        </h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                            {modal.message}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="-m-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        onClick={() => (isConfirm ? modal.onCancel() : modal.onClose())}
                        aria-label={t('common.close')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:px-6">
                    {isConfirm ? (
                        <>
                            <button
                                type="button"
                                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                                onClick={modal.onCancel}
                            >
                                {modal.cancelLabel || t('common.no')}
                            </button>
                            <button
                                type="button"
                                className={`rounded-xl px-4 py-2.5 text-sm font-bold ${confirmBtnClass}`}
                                onClick={modal.onConfirm}
                            >
                                {modal.confirmLabel || t('common.yes')}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className={`rounded-xl px-5 py-2.5 text-sm font-bold ${confirmBtnClass}`}
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
            className="pointer-events-none fixed top-4 right-4 z-[10000] flex max-w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
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

    const mounted = typeof document !== 'undefined'

    return (
        <DialogContext.Provider value={{ showAlert, showConfirm, showToast }}>
            {children}
            {mounted &&
                modal &&
                createPortal(<ModalLayer modal={modal} />, document.body)}
            {mounted && toasts.length > 0 &&
                createPortal(
                    <ToastStack
                        items={toasts}
                        onDismiss={(id) =>
                            setToasts((prev) => prev.filter((x) => x.id !== id))
                        }
                    />,
                    document.body
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
