'use client'

import { Fragment, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import MoliyaTopNav from '@/components/MoliyaTopNav'
import { MoliyaCardSkeleton } from '@/components/MoliyaSkeletons'
import { Building2, Plus, Trash2, Pencil, X, ChevronRight, ArrowLeft } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { pickLocalizedName } from '@/utils/localizedName'
import {
    directDeptTotalsByCurrency,
    formatFinAmount,
    normalizeFinCurrency,
    rollupDepartmentTotals,
} from '@/utils/financeCurrency'

function deptPathLabels(stack, departments, language) {
    return stack.map((id) => {
        const d = departments.find((x) => x.id === id)
        return d ? pickLocalizedName(d, language) : ''
    })
}

export default function MoliyaBolimlarPage() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert, showConfirm } = useDialog()

    const withTimeout = (promise, ms, label) =>
        Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(label || `Timeout after ${ms}ms`)), ms)),
        ])

    const [departments, setDepartments] = useState([])
    const [expenseEntries, setExpenseEntries] = useState([])
    const [rawMaterials, setRawMaterials] = useState([])
    const [deptTotals, setDeptTotals] = useState({ UZS: {}, USD: {} })
    const [loading, setLoading] = useState(true)
    const [stack, setStack] = useState([])

    const [deptFormOpen, setDeptFormOpen] = useState(false)
    const [deptForm, setDeptForm] = useState({ name_uz: '', name_ru: '', name_en: '', sort_order: '0' })
    const [deptEditId, setDeptEditId] = useState(null)

    const [expenseModalOpen, setExpenseModalOpen] = useState(false)
    const [expEditId, setExpEditId] = useState(null)
    const [expForm, setExpForm] = useState({
        material_name: '',
        quantity: '',
        amount: '',
        currency: 'UZS',
        expense_date: new Date().toISOString().split('T')[0],
        note: '',
    })

    const currentDeptId = stack.length ? stack[stack.length - 1] : null
    const isRootAdd = !currentDeptId && !deptEditId

    const rawMaterialById = useMemo(() => {
        const m = {}
        for (const r of rawMaterials) m[r.id] = r
        return m
    }, [rawMaterials])

    useEffect(() => {
        if (deptEditId) setDeptFormOpen(true)
    }, [deptEditId])

    useEffect(() => {
        if (!expenseModalOpen) return
        const onKey = (e) => {
            if (e.key === 'Escape') setExpenseModalOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [expenseModalOpen])

    const loadDepartments = useCallback(async () => {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })

        if (error) {
            console.error(error)
            await showAlert(`${t('finances.departmentsLoadError')}: ${error.message}`, { variant: 'error' })
            return []
        }
        const rows = data || []
        setDepartments(rows)
        return rows
    }, [showAlert, t])

    const loadRawMaterials = useCallback(async () => {
        const { data, error } = await supabase
            .from('raw_materials')
            .select('id,name_uz,name_ru,name_en,unit,unit_price,track_stock,stock_quantity')
            .order('created_at', { ascending: true })

        if (error) {
            console.error(error)
            // Xom ashyo jadvali bo'lmasa ham bo'limlar sahifasi ochilishi kerak.
            setRawMaterials([])
            return
        }

        setRawMaterials(data || [])
    }, [])

    const refreshDeptTotals = useCallback(async (depts) => {
        const { data, error } = await supabase.from('material_movements').select('department_id, total_cost, currency')
        if (error) {
            console.error(error)
            return
        }

        const { UZS: directUzs, USD: directUsd } = directDeptTotalsByCurrency(data || [])
        setDeptTotals({
            UZS: rollupDepartmentTotals(depts || [], directUzs),
            USD: rollupDepartmentTotals(depts || [], directUsd),
        })
    }, [])

    const loadExpenseEntries = useCallback(
        async (deptId) => {
            if (!deptId) {
                setExpenseEntries([])
                return
            }
            const { data, error } = await supabase
                .from('material_movements')
                .select(
                    'id, raw_material_id, unit_price_snapshot, quantity, total_cost, movement_date, note, created_at, currency'
                )
                .eq('department_id', deptId)
                .order('movement_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(200)

            if (error) {
                if (String(error.message || '').includes('material_movements')) {
                    await showAlert(t('finances.expenseEntriesTableMissing'), { variant: 'warning' })
                } else {
                    await showAlert(`${t('finances.expenseEntriesLoadError')}: ${error.message}`, { variant: 'error' })
                }
                setExpenseEntries([])
                return
            }
            setExpenseEntries(
                (data || []).map((m) => ({
                    ...m,
                    expense_date: m.movement_date,
                    quantity: Number(m.quantity || 0),
                    amount: Number(m.total_cost || 0),
                    currency: normalizeFinCurrency(m.currency),
                    created_at: m.created_at,
                }))
            )
        },
        [showAlert, t]
    )

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            if (!cancelled) setLoading(true)
            try {
                const loadedDepts = await withTimeout(loadDepartments(), 10000, 'departments timeout')
                await withTimeout(loadRawMaterials(), 10000, 'raw_materials timeout')
                await withTimeout(refreshDeptTotals(loadedDepts), 10000, 'refreshDeptTotals timeout')
            } catch (err) {
                console.error(err)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [loadDepartments, loadRawMaterials, refreshDeptTotals])

    useEffect(() => {
        if (currentDeptId) loadExpenseEntries(currentDeptId)
        else setExpenseEntries([])
    }, [currentDeptId, loadExpenseEntries])

    const childDepartments = useMemo(() => {
        if (!currentDeptId) return departments.filter((d) => d.parent_id == null || d.parent_id === undefined)
        return departments.filter((d) => d.parent_id === currentDeptId)
    }, [departments, currentDeptId])

    const parentHasChildren = useMemo(() => {
        // "id" - bo'lim, "parent_id" - uning ota bo'limi bo'lgani uchun, ota bo'limda child borligini Set orqali belgilaymiz.
        const set = new Set()
        for (const d of departments) {
            if (d.parent_id != null) set.add(d.parent_id)
        }
        return set
    }, [departments])

    const expenseTotalsByCurrency = useMemo(() => {
        let uz = 0
        let us = 0
        for (const e of expenseEntries) {
            const a = Number(e.amount || 0)
            if (normalizeFinCurrency(e.currency) === 'USD') us += a
            else uz += a
        }
        return { UZS: uz, USD: us }
    }, [expenseEntries])

    const groupedExpenseEntries = useMemo(() => {
        const toEpoch = (e) => {
            const base = String(e.expense_date || '')
            const time = e.created_at ? new Date(e.created_at).toTimeString().slice(0, 8) : '00:00:00'
            const dt = new Date(`${base}T${time}`)
            const t = dt.getTime()
            return Number.isNaN(t) ? 0 : t
        }

        const groupsMap = {}
        for (const en of expenseEntries) {
            const label = rawMaterialById[en.raw_material_id] ? pickLocalizedName(rawMaterialById[en.raw_material_id], language) : '—'
            if (!groupsMap[label]) groupsMap[label] = []
            groupsMap[label].push(en)
        }

        const groups = Object.entries(groupsMap).map(([material, rows]) => {
            const sortedRows = [...rows].sort((a, b) => toEpoch(b) - toEpoch(a))
            return { material, rows: sortedRows, latest: sortedRows[0] ? toEpoch(sortedRows[0]) : 0 }
        })

        return groups.sort((a, b) => b.latest - a.latest)
    }, [expenseEntries, rawMaterialById, language])

    const parentIdForNewDept = currentDeptId

    function resetDeptForm() {
        setDeptForm({ name_uz: '', name_ru: '', name_en: '', sort_order: '0' })
        setDeptEditId(null)
        setDeptFormOpen(false)
    }

    async function saveDepartment(e) {
        e.preventDefault()
        if (!deptForm.name_uz.trim()) {
            await showAlert(t('finances.nameUzRequired'), { variant: 'warning' })
            return
        }
        const row = {
            name_uz: deptForm.name_uz.trim(),
            name_ru: deptForm.name_ru.trim() || null,
            name_en: deptForm.name_en.trim() || null,
            sort_order: parseInt(deptForm.sort_order, 10) || 0,
        }
        try {
            if (deptEditId) {
                const { error } = await supabase.from('departments').update(row).eq('id', deptEditId)
                if (error) throw error
            } else {
                const { error } = await supabase.from('departments').insert([{ ...row, parent_id: parentIdForNewDept }])
                if (error) throw error
            }
            resetDeptForm()
            setDeptFormOpen(false)
            await loadDepartments()
        } catch (err) {
            console.error(err)
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }

    async function deleteDepartment(id) {
        if (!(await showConfirm(t('finances.departmentDeleteConfirm'), { variant: 'warning' }))) return
        try {
            const { error } = await supabase.from('departments').delete().eq('id', id)
            if (error) throw error
            setStack((s) => s.filter((x) => x !== id))
            const loadedDepts = await loadDepartments()
            await refreshDeptTotals(loadedDepts)
        } catch (err) {
            console.error(err)
            await showAlert(t('common.deleteError'), { variant: 'error' })
        }
    }

    function startEditDepartment(d) {
        setDeptEditId(d.id)
        setDeptForm({
            name_uz: d.name_uz || '',
            name_ru: d.name_ru || '',
            name_en: d.name_en || '',
            sort_order: String(d.sort_order ?? 0),
        })
    }

    async function saveExpenseEntry(e) {
        e.preventDefault()
        if (!currentDeptId) return

        const qty = parseFloat(expForm.quantity)
        const amt = parseFloat(expForm.amount)
        const materialName = (expForm.material_name || '').trim()

        if (!materialName) {
            await showAlert(t('common.saveError'), { variant: 'warning' })
            return
        }
        if (Number.isNaN(qty) || qty <= 0) {
            await showAlert(t('common.saveError'), { variant: 'warning' })
            return
        }
        if (Number.isNaN(amt) || amt <= 0) {
            await showAlert(t('common.saveError'), { variant: 'warning' })
            return
        }

        let selectedRawMaterial = rawMaterials.find((r) => pickLocalizedName(r, language).toLowerCase() === materialName.toLowerCase())
        const unitPrice = amt / qty

        try {
            if (!selectedRawMaterial) {
                const { data: newMat, error: matErr } = await supabase
                    .from('raw_materials')
                    .insert([
                        {
                            name_uz: materialName,
                            name_ru: null,
                            name_en: null,
                            unit: 'pcs',
                            unit_price: unitPrice,
                            track_stock: false,
                            stock_quantity: null,
                        },
                    ])
                    .select('id,name_uz,name_ru,name_en,unit,unit_price,track_stock,stock_quantity')
                    .single()
                if (matErr) throw matErr
                selectedRawMaterial = newMat
                setRawMaterials((prev) => [...prev, newMat])
            }

            // Har bir kiritish alohida tarix bo'lib saqlansin (merge qilinmaydi).
            if (expEditId) {
                const { error } = await supabase
                    .from('material_movements')
                    .update({
                        raw_material_id: selectedRawMaterial.id,
                        quantity: qty,
                        unit_price_snapshot: unitPrice,
                        total_cost: amt,
                        movement_date: expForm.expense_date,
                        note: expForm.note.trim() || null,
                        currency: normalizeFinCurrency(expForm.currency),
                    })
                    .eq('id', expEditId)
                if (error) throw error
            } else {
                const { error } = await supabase.from('material_movements').insert([
                    {
                        department_id: currentDeptId,
                        raw_material_id: selectedRawMaterial.id,
                        quantity: qty,
                        unit_price_snapshot: unitPrice,
                        total_cost: amt,
                        movement_date: expForm.expense_date,
                        note: expForm.note.trim() || null,
                        currency: normalizeFinCurrency(expForm.currency),
                    },
                ])
                if (error) throw error
            }

            setExpenseModalOpen(false)
            setExpEditId(null)
            setExpForm({
                material_name: '',
                quantity: '',
                amount: '',
                currency: 'UZS',
                expense_date: new Date().toISOString().split('T')[0],
                note: '',
            })
            await showAlert(t('finances.expenseEntrySaved'), { variant: 'success' })
            await loadExpenseEntries(currentDeptId)
            await refreshDeptTotals()
        } catch (err) {
            console.error(err)
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }

    async function deleteExpenseEntry(id) {
        if (!(await showConfirm(t('finances.deleteConfirm'), { variant: 'warning' }))) return
        try {
            const { error } = await supabase.from('material_movements').delete().eq('id', id)
            if (error) throw error
            await loadExpenseEntries(currentDeptId)
            await refreshDeptTotals()
        } catch (err) {
            console.error(err)
            await showAlert(t('common.deleteError'), { variant: 'error' })
        }
    }

    function startEditExpenseEntry(en) {
        const materialName = rawMaterialById[en.raw_material_id] ? pickLocalizedName(rawMaterialById[en.raw_material_id], language) : ''
        setExpEditId(en.id)
        setExpForm({
            material_name: materialName,
            quantity: String(en.quantity ?? ''),
            amount: String(en.amount ?? ''),
            currency: normalizeFinCurrency(en.currency),
            expense_date: en.expense_date || new Date().toISOString().split('T')[0],
            note: en.note || '',
        })
        setExpenseModalOpen(true)
    }

    const crumbs = deptPathLabels(stack, departments, language)
    const pathTitle = crumbs.length ? crumbs.join(' › ') : null

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-6">
                <Header title={t('finances.financeBranchDepartments')} toggleSidebar={toggleSidebar} />
                <MoliyaTopNav />
                <MoliyaCardSkeleton />
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto px-6 pb-16">
            <Header title={t('finances.financeBranchDepartments')} toggleSidebar={toggleSidebar} />
            <MoliyaTopNav />

            <p className="text-gray-600 text-sm mb-3 leading-relaxed">{t('finances.moliyaDepartmentsFlowHint')}</p>

            {pathTitle && (
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 truncate" title={pathTitle}>
                    {pathTitle}
                </p>
            )}

            <nav
                className="flex flex-nowrap sm:flex-wrap items-center gap-1 text-sm mb-6 text-gray-600 overflow-x-auto pb-1 -mx-1 px-1"
                aria-label="Breadcrumb"
            >
                <button
                    type="button"
                    onClick={() => setStack([])}
                    className="shrink-0 font-medium text-blue-600 hover:underline rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    {t('finances.deptBreadcrumbRoot')}
                </button>
                {crumbs.map((label, i) => (
                    <span key={stack[i]} className="flex items-center gap-1 shrink-0">
                        <ChevronRight size={14} className="text-gray-400" />
                        <button
                            type="button"
                            onClick={() => setStack(stack.slice(0, i + 1))}
                            className="hover:text-blue-600 hover:underline font-medium text-gray-800 max-w-[140px] sm:max-w-none truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md px-1"
                            title={label}
                        >
                            {label}
                        </button>
                    </span>
                ))}
            </nav>

            {currentDeptId && (
                <button
                    type="button"
                    onClick={() => setStack((s) => s.slice(0, -1))}
                    className="inline-flex items-center gap-2 text-sm text-blue-600 mb-6 hover:underline font-medium rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-1"
                >
                    <ArrowLeft size={16} />
                    {t('finances.deptBack')}
                </button>
            )}

            {currentDeptId && (
                <div className="bg-white rounded-2xl border-2 border-emerald-200/80 shadow-md p-6 overflow-hidden mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">{t('finances.expensesBlockTitle')}</h2>
                            <p className="text-sm text-gray-500 mt-0.5">{pickLocalizedName(departments.find((d) => d.id === currentDeptId), language)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setExpenseModalOpen(true)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600 shrink-0"
                        >
                            <Plus size={16} />
                            {t('finances.addExpenseCompact')}
                        </button>
                    </div>

                    <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between gap-2">
                        <span className="text-sm font-medium text-emerald-900">{t('finances.expensesTotalLabel')}</span>
                        <div className="flex flex-col items-end gap-1 text-right">
                            {expenseTotalsByCurrency.UZS > 0.01 ? (
                                <span className="text-lg sm:text-2xl font-bold tabular-nums text-emerald-800">
                                    {formatFinAmount(expenseTotalsByCurrency.UZS, 'UZS')}
                                </span>
                            ) : null}
                            {expenseTotalsByCurrency.USD > 0.01 ? (
                                <span className="text-lg sm:text-2xl font-bold tabular-nums text-emerald-800">
                                    {formatFinAmount(expenseTotalsByCurrency.USD, 'USD')}
                                </span>
                            ) : null}
                            {expenseTotalsByCurrency.UZS < 0.01 && expenseTotalsByCurrency.USD < 0.01 ? (
                                <span className="text-lg font-semibold text-emerald-700/80">—</span>
                            ) : null}
                        </div>
                    </div>

                    <div className="max-h-[min(55vh,420px)] overflow-auto rounded-xl border border-gray-100">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-gray-100 text-left text-gray-700 shadow-[0_1px_0_0_rgb(229,231,235)]">
                                    <th className="px-3 py-3 font-semibold">{t('finances.date')}</th>
                                    <th className="px-3 py-3 font-semibold">Vaqt</th>
                                    <th className="px-3 py-3 font-semibold">{t('finances.materialLabel')}</th>
                                    <th className="px-3 py-3 font-semibold">{t('finances.quantityLabel')}</th>
                                    <th className="px-3 py-3 font-semibold">{t('finances.amountWithCurrency')}</th>
                                    <th className="px-3 py-3 font-semibold">{t('finances.costNote')}</th>
                                    <th className="px-3 py-3 w-20" />
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {groupedExpenseEntries.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                                            {t('finances.noExpenseEntries')}
                                        </td>
                                    </tr>
                                )}
                                {groupedExpenseEntries.map((group) => (
                                    <Fragment key={`grp-${group.material}`}>
                                        <tr className="border-t border-gray-200 bg-blue-50/60">
                                            <td colSpan={7} className="px-3 py-2.5 font-semibold text-blue-900">
                                                {group.material}
                                            </td>
                                        </tr>
                                        {group.rows.map((en) => (
                                            <tr key={en.id} className="border-t border-gray-100 hover:bg-gray-50/80 transition-colors">
                                                <td className="px-3 py-2.5 whitespace-nowrap">{en.expense_date}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                                                    {en.created_at
                                                        ? new Date(en.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                        : '—'}
                                                </td>
                                                <td className="px-3 py-2.5 text-gray-900 max-w-[260px] truncate" title={group.material}>
                                                    {group.material}
                                                </td>
                                                <td className="px-3 py-2.5 font-medium tabular-nums">{Number(en.quantity || 0).toLocaleString()}</td>
                                                <td className="px-3 py-2.5 font-medium tabular-nums whitespace-nowrap">
                                                    {formatFinAmount(en.amount, en.currency)}
                                                </td>
                                                <td className="px-3 py-2.5 text-gray-600 max-w-[200px] sm:max-w-[280px] truncate" title={en.note || ''}>
                                                    {en.note || '—'}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditExpenseEntry(en)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                                            title={t('common.edit')}
                                                            aria-label={t('common.edit')}
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteExpenseEntry(en.id)}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                                            title={t('common.delete')}
                                                            aria-label={t('common.delete')}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!currentDeptId && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <Building2 className="text-slate-700" size={22} />
                    <h2 className="text-lg font-bold text-gray-900">
                        {currentDeptId ? t('finances.deptSubItemsTitle') : t('finances.deptRootListTitle')}
                    </h2>
                </div>

                <div className="mb-6">
                    {deptFormOpen && (
                        <form
                            onSubmit={saveDepartment}
                            className="space-y-3 mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100"
                        >
                            <p className="text-xs text-gray-600 flex items-start gap-1">
                                <Plus size={12} className="mt-0.5 shrink-0" />
                                {currentDeptId ? t('finances.deptAddSubHint') : t('finances.deptAddRootHint')}
                            </p>
                            {isRootAdd ? (
                                <div className="grid grid-cols-1 gap-2">
                                    <input
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                        placeholder={t('finances.nameUz')}
                                        value={deptForm.name_uz}
                                        onChange={(e) => setDeptForm((f) => ({ ...f, name_uz: e.target.value }))}
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <input
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                        placeholder={t('finances.nameUz')}
                                        value={deptForm.name_uz}
                                        onChange={(e) => setDeptForm((f) => ({ ...f, name_uz: e.target.value }))}
                                    />
                                    <input
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                        placeholder={t('finances.nameRu')}
                                        value={deptForm.name_ru}
                                        onChange={(e) => setDeptForm((f) => ({ ...f, name_ru: e.target.value }))}
                                    />
                                    <input
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                        placeholder={t('finances.nameEn')}
                                        value={deptForm.name_en}
                                        onChange={(e) => setDeptForm((f) => ({ ...f, name_en: e.target.value }))}
                                    />
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2 items-center">
                                {!isRootAdd && (
                                    <input
                                        type="number"
                                        className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none"
                                        placeholder={t('finances.sortOrder')}
                                        value={deptForm.sort_order}
                                        onChange={(e) => setDeptForm((f) => ({ ...f, sort_order: e.target.value }))}
                                    />
                                )}
                                <button
                                    type="submit"
                                    className="inline-flex items-center gap-1 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-800"
                                >
                                    <Plus size={16} />
                                    {deptEditId ? t('common.save') : currentDeptId ? t('finances.deptAddChild') : t('finances.deptAddRoot')}
                                </button>
                                {(deptEditId || isRootAdd) && (
                                    <button
                                        type="button"
                                        onClick={resetDeptForm}
                                        className="inline-flex items-center gap-1 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
                                    >
                                        <X size={16} />
                                        {t('common.cancel')}
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
                </div>

                <div className="flex flex-nowrap items-stretch gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {childDepartments.length === 0 && (
                        <div className="shrink-0 min-w-[220px] text-gray-500 text-sm py-8 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                            {currentDeptId ? t('finances.noChildDepartments') : t('finances.noDepartments')}
                        </div>
                    )}

                    {childDepartments.map((d, idx) => {
                        const isLeafNode = !parentHasChildren.has(d.id)

                        // "leaf" bo'limlarni ajratib ko'rsatish uchun rang beramiz; qolganlari ko'k.
                        const cardBg =
                            !isLeafNode
                                ? 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500'
                                : idx % 2 === 0
                                  ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
                                  : 'bg-gray-700 hover:bg-gray-800 focus-visible:ring-gray-500'

                        const name = pickLocalizedName(d, language)

                        return (
                            <div key={d.id} className="relative shrink-0 group">
                                <button
                                    type="button"
                                    title={name}
                                    onClick={() => setStack((s) => [...s, d.id])}
                                    className={`px-4 py-3 rounded-xl ${cardBg} text-white font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 shadow-sm transition-colors min-w-[140px] max-w-[210px]`}
                                >
                                    <span className="block text-center leading-tight break-words">{name}</span>
                                    <span
                                        className="block text-center text-[10px] font-semibold text-white/90 mt-1 tabular-nums leading-tight space-y-0.5"
                                        title={t('finances.expensesTotalLabel')}
                                    >
                                        {(deptTotals.UZS?.[d.id] ?? 0) > 0.01 ? (
                                            <span className="block">{formatFinAmount(deptTotals.UZS[d.id], 'UZS')}</span>
                                        ) : null}
                                        {(deptTotals.USD?.[d.id] ?? 0) > 0.01 ? (
                                            <span className="block">{formatFinAmount(deptTotals.USD[d.id], 'USD')}</span>
                                        ) : null}
                                        {(deptTotals.UZS?.[d.id] ?? 0) < 0.01 && (deptTotals.USD?.[d.id] ?? 0) < 0.01 ? (
                                            <span className="block">—</span>
                                        ) : null}
                                    </span>
                                </button>

                                {/* Edit/ochirish: hover yoki fokus bo'lganda ko'rinadi */}
                                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none transition-opacity">
                                    <div className="pointer-events-auto">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                startEditDepartment(d)
                                            }}
                                            className="p-2 rounded-lg bg-white/95 hover:bg-white text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                            title={t('common.edit')}
                                            aria-label={t('common.edit')}
                                        >
                                            <Pencil size={16} />
                                        </button>
                                    </div>
                                    <div className="pointer-events-auto">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                deleteDepartment(d.id)
                                            }}
                                            className="p-2 rounded-lg bg-white/95 hover:bg-white text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    <button
                        type="button"
                        onClick={() => {
                            resetDeptForm()
                            setDeptFormOpen(true)
                        }}
                        aria-label={t('finances.deptFormShow')}
                        title={t('finances.deptFormShow')}
                        className="shrink-0 px-4 py-3 rounded-xl bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500 shadow-sm transition-colors min-w-[88px] flex items-center justify-center"
                    >
                        <Plus size={22} />
                    </button>
                </div>
                </div>
            )}

            {expenseModalOpen && currentDeptId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setExpenseModalOpen(false)}
                    role="presentation"
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto border border-gray-100"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="expense-modal-title"
                    >
                        <h3 id="expense-modal-title" className="text-lg font-bold text-gray-900 mb-4">
                            {expEditId ? t('common.edit') : t('finances.addExpenseTitle')}
                        </h3>
                        <form onSubmit={saveExpenseEntry} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.materialLabel')}</label>
                                    <input
                                        list="material-suggestions"
                                        value={expForm.material_name}
                                        onChange={(e) => setExpForm((f) => ({ ...f, material_name: e.target.value }))}
                                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none text-sm"
                                        placeholder={t('finances.selectPlaceholder')}
                                        required
                                    />
                                    <datalist id="material-suggestions">
                                        {rawMaterials.map((rm) => (
                                            <option key={rm.id} value={pickLocalizedName(rm, language)} />
                                        ))}
                                    </datalist>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.quantityLabel')}</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        autoFocus
                                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
                                        value={expForm.quantity}
                                        onChange={(e) => setExpForm((f) => ({ ...f, quantity: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.currencyLabel')}</label>
                                <div className="flex flex-wrap gap-3 py-1">
                                    {['UZS', 'USD'].map((c) => (
                                        <label key={c} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="radio"
                                                name="exp-currency"
                                                checked={normalizeFinCurrency(expForm.currency) === c}
                                                onChange={() => setExpForm((f) => ({ ...f, currency: c }))}
                                                className="rounded-full border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                            {c === 'UZS' ? t('finances.finCurrencyUzs') : t('finances.finCurrencyUsd')}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.amountInSelectedCurrency')}</label>
                                <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none"
                                    value={expForm.amount}
                                    onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.date')}</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500/30 outline-none"
                                    value={expForm.expense_date}
                                    onChange={(e) => setExpForm((f) => ({ ...f, expense_date: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('finances.costNote')}</label>
                                <input
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500/30 outline-none"
                                    value={expForm.note}
                                    onChange={(e) => setExpForm((f) => ({ ...f, note: e.target.value }))}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setExpenseModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600"
                                >
                                    {t('common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
