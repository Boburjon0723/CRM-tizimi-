'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { EMPLOYEES_SECTION_UNLOCK_KEY, getEmployeesActionPin } from '@/lib/employeesSectionPin'

export default function EmployeesLayout({ children }) {
    const { t } = useLanguage()
    const { showAlert } = useDialog()
    const pin = getEmployeesActionPin()
    const [mounted, setMounted] = useState(false)
    const [sessionOk, setSessionOk] = useState(false)
    const [pinInput, setPinInput] = useState('')

    useEffect(() => {
        setMounted(true)
        if (!pin) return
        try {
            if (sessionStorage.getItem(EMPLOYEES_SECTION_UNLOCK_KEY) === '1') {
                setSessionOk(true)
            }
        } catch (_) {
            /* ignore */
        }
    }, [pin])

    async function handleUnlock(e) {
        e.preventDefault()
        if (pinInput.trim() !== pin) {
            await showAlert(t('finances.deletePinWrong'), { variant: 'error' })
            return
        }
        try {
            sessionStorage.setItem(EMPLOYEES_SECTION_UNLOCK_KEY, '1')
        } catch (_) {
            /* ignore */
        }
        setSessionOk(true)
        setPinInput('')
    }

    if (!mounted) {
        return (
            <div className="min-h-[50vh] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        )
    }

    if (!pin) {
        return <>{children}</>
    }

    if (!sessionOk) {
        return (
            <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <form
                    onSubmit={handleUnlock}
                    className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-100"
                >
                    <h1 className="text-lg font-bold text-gray-900">{t('employees.sectionPinGateTitle')}</h1>
                    <p className="text-sm text-gray-600 mt-2">{t('employees.sectionPinGateIntro')}</p>
                    <p className="text-xs text-gray-500 mt-3">{t('finances.deletePinHint')}</p>
                    <input
                        type="password"
                        name="employees-section-pin"
                        autoComplete="off"
                        autoFocus
                        className="mt-4 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={t('finances.deletePinLabel')}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                    />
                    <button
                        type="submit"
                        className="mt-4 w-full py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 text-sm"
                    >
                        {t('common.ok')}
                    </button>
                </form>
            </div>
        )
    }

    return <>{children}</>
}
