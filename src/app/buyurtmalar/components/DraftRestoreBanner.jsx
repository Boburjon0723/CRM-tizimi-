'use client'

export default function DraftRestoreBanner({ t, onRestore, onDismiss }) {
    return (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">{t('orders.draftRestorePrompt')}</p>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onRestore}
                    className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700"
                >
                    {t('orders.draftContinue')}
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="rounded-xl border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-900 hover:bg-amber-100"
                >
                    {t('orders.draftDiscard')}
                </button>
            </div>
        </div>
    )
}
