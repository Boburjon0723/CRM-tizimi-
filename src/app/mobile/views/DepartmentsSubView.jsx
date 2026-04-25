'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { 
    Building2, 
    ChevronRight, 
    ChevronLeft, 
    Layers, 
    History, 
    TrendingDown, 
    Loader2, 
    ArrowRight,
    Search
} from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { 
    normalizeFinCurrency, 
    formatFinAmount, 
    rollupDepartmentTotals, 
    directDeptTotalsByCurrency 
} from '@/utils/financeCurrency'

export default function DepartmentsSubView() {
    const { t } = useLanguage()
    const [loading, setLoading] = useState(true)
    const [departments, setDepartments] = useState([])
    const [movements, setMovements] = useState([])
    const [rawMaterials, setRawMaterials] = useState([])
    const [stack, setStack] = useState([]) // Array of department IDs for navigation

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            setLoading(true)
            const { data: d } = await supabase
                .from('departments')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true })

            const { data: m } = await supabase
                .from('material_movements')
                .select('*')

            const { data: rm } = await supabase
                .from('raw_materials')
                .select('id, name_uz')

            setDepartments(d || [])
            setMovements(m || [])
            setRawMaterials(rm || [])
        } catch (error) {
            console.error('Error fetching departments data:', error)
        } finally {
            setLoading(false)
        }
    }

    const currentDeptId = stack.length > 0 ? stack[stack.length - 1] : null

    // Calculate totals matching desktop rollup logic
    const rolledTotals = useMemo(() => {
        const { UZS, USD } = directDeptTotalsByCurrency(movements)
        return {
            UZS: rollupDepartmentTotals(departments, UZS),
            USD: rollupDepartmentTotals(departments, USD)
        }
    }, [departments, movements])

    const currentLevelItems = useMemo(() => {
        return departments.filter(d => d.parent_id === (currentDeptId || null))
    }, [departments, currentDeptId])

    const currentDeptMovements = useMemo(() => {
        if (!currentDeptId) return []
        return movements
            .filter(m => m.department_id === currentDeptId)
            .sort((a, b) => new Date(b.movement_date) - new Date(a.movement_date))
    }, [movements, currentDeptId])

    const breadcrumbs = useMemo(() => {
        return stack.map(id => departments.find(d => d.id === id))
    }, [stack, departments])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
                <p className="text-sm font-medium">Bo'limlar yuklanmoqda...</p>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-white">Bo'limlar tahlili</h2>
            </div>

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                    onClick={() => setStack([])}
                    className={`text-xs font-bold whitespace-nowrap px-3 py-1.5 rounded-full transition-all ${
                        stack.length === 0 ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500 hover:text-slate-300'
                    }`}
                >
                    Asosiy
                </button>
                {breadcrumbs.map((dept, i) => (
                    <div key={dept.id} className="flex items-center gap-2 shrink-0">
                        <ChevronRight size={14} className="text-slate-700" />
                        <button 
                            onClick={() => setStack(stack.slice(0, i + 1))}
                            className={`text-xs font-bold whitespace-nowrap px-3 py-1.5 rounded-full transition-all ${
                                i === stack.length - 1 ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500'
                            }`}
                        >
                            {dept.name_uz}
                        </button>
                    </div>
                ))}
            </nav>

            {/* List of Departments (at current level) */}
            <div className="space-y-3">
                {currentLevelItems.length > 0 ? (
                    currentLevelItems.map(d => {
                        const uzs = rolledTotals.UZS[d.id] || 0
                        const usd = rolledTotals.USD[d.id] || 0
                        const hasSub = departments.some(sub => sub.parent_id === d.id)

                        return (
                            <div 
                                key={d.id}
                                onClick={() => setStack([...stack, d.id])}
                                className="p-5 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-4 group shadow-lg"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-slate-500/10 text-slate-400 flex items-center justify-center shrink-0">
                                    <Layers size={22} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-bold text-white transition-colors">{d.name_uz}</h3>
                                    <div className="flex items-center gap-3 text-[10px] font-bold mt-1 tracking-tighter">
                                        <span className="text-emerald-400/80">{uzs.toLocaleString()} UZS</span>
                                        {usd > 0 && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                                <span className="text-indigo-400/80">${usd.toLocaleString()}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {hasSub ? (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Ichki</span>
                                        <ChevronRight size={18} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                         <span className="text-[10px] font-bold text-emerald-600/50 uppercase tracking-tighter">Oxirgi</span>
                                         <ArrowRight size={18} className="text-slate-800" />
                                    </div>
                                )}
                            </div>
                        )
                    })
                ) : !currentDeptId && (
                    <p className="text-center py-12 text-slate-500 text-sm italic">Bo'limlar topilmadi</p>
                )}
            </div>

            {/* Expense History for selected department */}
            {currentDeptId && (
                <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-400">
                            <History size={16} />
                            <h4 className="text-xs font-bold uppercase tracking-widest px-1">Xarajatlar tarixi</h4>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {currentDeptMovements.length > 0 ? (
                            currentDeptMovements.map(m => {
                                const material = rawMaterials.find(rm => rm.id === m.raw_material_id)
                                return (
                                    <div key={m.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
                                            <TrendingDown size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">
                                                {material ? material.name_uz : 'Noma\'lum xarajat'}
                                            </p>
                                            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                                                <p>{m.movement_date}</p>
                                                <span>•</span>
                                                <p>{m.quantity?.toLocaleString() || 1} Dona</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold tabular-nums text-rose-400">
                                                -{normalizeFinCurrency(m.currency) === 'USD' ? '$' : ''}
                                                {Number(m.total_cost).toLocaleString()}
                                            </p>
                                            {m.note && <p className="text-[10px] text-slate-600 truncate max-w-[80px]">{m.note}</p>}
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="text-center py-8 bg-white/5 rounded-3xl border border-dashed border-white/10">
                                <p className="text-xs text-slate-500 italic">Hozircha xarajatlar yo'q</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
