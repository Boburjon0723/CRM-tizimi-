'use client'

import { Suspense, useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification } from '@/utils/telegram'
import { formatUsd } from '@/utils/formatters'
import { normalizeModelKey } from '@/utils/validators'
import { deductStockForCompletedOrder, reverseStockForOrder } from '@/services/inventoryService'

import Header from '@/components/Header'
import {
    Plus,
    X,
    ShoppingCart,
    Clock,
    FileText,
    Archive,
    RotateCcw,
} from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { isDeletedAtMissingError } from '@/lib/orderTrash'

import {
    escapeHtml,
    parseOrderItemQty,
    parseOrderItemPrice,
    orderItemLineNoteText,
    mergeLineNotes,
    isSchemaOrEmbedError,
    fetchOrdersPageWithFallback,
    fetchDeletedOrdersPageWithFallback,
    fetchOrderItemsForOrderId,
    fetchOrderItemsForOrderIds,
    normalizeOrderItemColorKey,
    displayProductName,
    productNameFields,
    productDescriptionFields,
    normalizeColorsArray,
    labelColorCanonical,
    expandOrderLineForSubmit,
    LS_LAST_ORDER,
    SESSION_NEW_ORDER_DRAFT,
    saveNewOrderDraft,
    loadNewOrderDraft,
    clearNewOrderDraft,
    draftHasMeaningfulContent,
    generateDisplayOrderNumber,
    exportOrdersToCsv,
    skuBucketKeyForOrderItem,
    dedupeOrderItemsKeepNewest,
    resolvedModelCodeForExpandedRow,
    resolvedModelCodeForItemPayload,
    mergeExpandedRowsForSubmit,
    mergeOrderItemPayloadsForDb,
    resolvedOrderItemSizeRaw,
    naturalCompareModelCode,
    minLineIndexInBucket,
    groupOrderItemsForPrint,
    categoryLabelFromGroupedLine,
    categoryLabelFromProduct,
    sortGroupedBucketsForPrint,
    buildColorQtyStacksHtml,
    buildOrderBlockHtml,
    buildPrintDocumentHtml,
    openPrintTab,
    normalizeSourceForDb,
    normalizeSourceForForm,
    normalizeStatusForSelect,
    ORDER_LIST_ITEMS_PREVIEW,
    createEmptyOrderLine,
    DEFAULT_TABLE_CONFIG,
    imagePxBySize,
    isLineCommittedToSortOrder,
    orderLinesHasDuplicateProduct,
    findFirstDuplicateProductLineId,
    mergeDuplicateSourceLineIntoTarget,
    dedupeOrderItemsById,
    normalizeOrderItemsForList,
    seedColorQtyForMatrix,
    orderItemToFormLine,
    orderItemsToOrderLines,
    computeOrderLineSubtotal,
    computeOrderLinesSubtotal,
    aggregateMergedOrdersTotals,
    orderCategoryLabels,
    filterOrderItemsByCategoryLabel,
    buildOrderFormTableRows,
    buildConsolidatedPrintHtml
} from './utils'

import StatsCards from './components/StatsCards'
import StatusTabs from './components/StatusTabs'
import OrdersFilter from './components/OrdersFilter'
import OrdersTable from './components/OrdersTable'
import OrderFormDialog from './components/OrderFormDialog'







function BuyurtmalarPageContent() {
    const searchParams = useSearchParams()
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert, showConfirm, showToast } = useDialog()
    const [orders, setOrders] = useState([])
    const [customers, setCustomers] = useState([])
    const [products, setProducts] = useState([])
    /** Ranglar lug‘ati — `product_colors` (name_uz / name_ru / name_en) */
    const [productColors, setProductColors] = useState([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    /** `all` bo‘lishi shart — `Hammasi` bilan hech qachon `matchesStatus` true bo‘lmaydi */
    const [filterStatus, setFilterStatus] = useState('all')
    /** Buyurtmalar ro‘yxatida mahsulot kategoriyasi bo‘yicha filter */
    const [filterCategory, setFilterCategory] = useState('all')
    /** Bir nechta buyurtmani bitta yangi buyurtmaga birlashtirish uchun tanlov */
    const [mergeSelection, setMergeSelection] = useState({})
    /** Birlashtirishdan keyin: jami summa/miqdor tanlangan buyurtmalarning o‘zidagi yig‘indilar (qatorlardan qayta hisoblanmaydi) */
    const [mergeSourceAgg, setMergeSourceAgg] = useState(null)
    /** Birlashtirish manbasi buyurtma idlari — saqlagach eski buyurtmalarni karzinkaga ko‘chirish uchun (jami daromad takrorlanmasin) */
    const [mergeSourceOrderIds, setMergeSourceOrderIds] = useState(null)
    /** Merge paytida manbalarni karzinkaga ko‘chirish (ikki marta daromad sanalmasin) */
    const [mergeArchiveSources, setMergeArchiveSources] = useState(true)
    /** Faol ro‘yxat yoki karzinka (o‘chirilganlar) */
    const [ordersListView, setOrdersListView] = useState('active')
    const [trashOrders, setTrashOrders] = useState([])
    const [trashOrderCount, setTrashOrderCount] = useState(0)
    const ordersListViewRef = useRef('active')
    const loadDataRef = useRef(async () => {})
    const loadTrashOrdersRef = useRef(async () => {})
    /** Buyurtmalar jadvalidagi mahsulotlar ro‘yxatini yoyish/yig‘ish */
    const [orderListExpandedById, setOrderListExpandedById] = useState({})
    const [tableConfig, setTableConfig] = useState(DEFAULT_TABLE_CONFIG)
    /** Yangi buyurtma: bir nechta qator — model kodi orqali mahsulot, soni qo‘lda */
    const [orderLines, setOrderLines] = useState([createEmptyOrderLine()])
    const [form, setForm] = useState({
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        total: '',
        status: 'new',
        note: '',
        source: 'dokon'
    })

    const selectedOrders = useMemo(() => {
        const list = ordersListView === 'active' ? orders : trashOrders
        return list.filter((o) => mergeSelection[o.id])
    }, [ordersListView, orders, trashOrders, mergeSelection])


    const firstModelCodeRef = useRef(null)
    /** Tahrir/yangi buyurtma paneli — jadvaldan keyin ochilganda ko‘rinish uchun scroll */
    const orderFormPanelRef = useRef(null)
    const formRef = useRef(form)
    const orderLinesRef = useRef(orderLines)
    const isAddingRef = useRef(isAdding)
    /** Saqlash ikki marta ketma-ket ishlamasin */
    const savingOrderRef = useRef(false)
    const [isSavingOrder, setIsSavingOrder] = useState(false)
    /** Sahifaga qaytishda qoralama — «Davom ettirish» paneli */
    const [draftBanner, setDraftBanner] = useState(false)
    /** Tahrirlanayotgan buyurtma id (yangi buyurtmada `null`) */
    const [editId, setEditId] = useState(null)
    const editIdRef = useRef(null)
    /** `handleEdit` ketma-ket chaqiruvlarida eski fetch formani buzmasin */
    const editLoadSeqRef = useRef(0)

    useEffect(() => {
        formRef.current = form
    }, [form])
    useEffect(() => {
        orderLinesRef.current = orderLines
    }, [orderLines])
    useEffect(() => {
        isAddingRef.current = isAdding
    }, [isAdding])
    useEffect(() => {
        editIdRef.current = editId
    }, [editId])

    useEffect(() => {
        const d = loadNewOrderDraft()
        if (d && draftHasMeaningfulContent(d) && !isAddingRef.current) {
            setDraftBanner(true)
        }
        try {
            const raw = localStorage.getItem('crm_orders_table_config_v1')
            if (raw) {
                const parsed = JSON.parse(raw)
                setTableConfig({ ...DEFAULT_TABLE_CONFIG, ...(parsed || {}) })
            }
        } catch (e) {
            console.warn('table config load', e)
        }
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem('crm_orders_table_config_v1', JSON.stringify(tableConfig))
        } catch (e) {
            console.warn('table config save', e)
        }
    }, [tableConfig])

    useEffect(() => {
        if (!isAdding || editId) return
        const tid = setTimeout(() => {
            saveNewOrderDraft(formRef.current, orderLinesRef.current)
        }, 600)
        return () => {
            clearTimeout(tid)
            if (isAddingRef.current && !editIdRef.current) {
                saveNewOrderDraft(formRef.current, orderLinesRef.current)
            }
        }
    }, [form, orderLines, isAdding, editId])

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'hidden' && isAddingRef.current && !editIdRef.current) {
                saveNewOrderDraft(formRef.current, orderLinesRef.current)
            }
        }
        document.addEventListener('visibilitychange', onVis)
        return () => document.removeEventListener('visibilitychange', onVis)
    }, [])

    useEffect(() => {
        if (isAdding && !editId) {
            const tid = setTimeout(() => firstModelCodeRef.current?.focus(), 100)
            return () => clearTimeout(tid)
        }
    }, [isAdding, editId])

    /** Jadvaldan «Tahrirlash» bosilganda forma yuqorida — foydalanuvchi ko‘rishi uchun */
    useEffect(() => {
        if (!isAdding) return
        const tid = setTimeout(() => {
            orderFormPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 80)
        return () => clearTimeout(tid)
    }, [isAdding, editId])

    useEffect(() => {
        ordersListViewRef.current = ordersListView
    }, [ordersListView])

    useEffect(() => {
        void loadDataRef.current()

        const reloadFromRemote = async () => {
            await loadDataRef.current({ silent: true })
            if (ordersListViewRef.current === 'trash') await loadTrashOrdersRef.current()
        }

        const channel = supabase
            .channel('orders_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
                playNotificationSound()
                void reloadFromRemote()
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
                void reloadFromRemote()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    function playNotificationSound() {
        if (typeof window !== 'undefined') {
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj')
                audio.play().catch(e => console.log('Audio play failed:', e))
            } catch (error) {
                console.error('Audio init failed:', error)
            }
        }
    }

    async function loadTrashOrders() {
        const { data, error } = await fetchDeletedOrdersPageWithFallback()
        if (error) console.error('loadTrashOrders:', error)
        setTrashOrders(data || [])
    }

    /** `silent: true` — tahrir/o‘chirishdan keyin: ro‘yxat yangilanadi, lekin butun sahifa spinneri yo‘q */
    async function loadData(opts = {}) {
        const silent = opts.silent === true
        try {
            if (!silent) setLoading(true)

            const { data: ordersData, error: ordersError } = await fetchOrdersPageWithFallback({ activeOnly: true })
            if (ordersError) throw ordersError

            let trashCnt = 0
            const trashCntRes = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .not('deleted_at', 'is', null)
            if (!trashCntRes.error) trashCnt = trashCntRes.count ?? 0
            else if (!isDeletedAtMissingError(trashCntRes.error)) console.warn('trash count:', trashCntRes.error)
            setTrashOrderCount(trashCnt)

            // Load Customers for dropdown
            const { data: customersData } = await supabase.from('customers').select('id, name, phone').order('name')

            // Barcha mahsulotlar — kategoriya nomi forma jadvalida tartib va jami uchun
            let productsData = null
            const prWithCat = await supabase
                .from('products')
                .select('*, categories(id, name, name_uz)')
                .order('name')
            if (prWithCat.error) {
                console.warn('products+categories:', prWithCat.error)
                const prFb = await supabase.from('products').select('*').order('name')
                productsData = prFb.data
            } else {
                productsData = prWithCat.data
            }

            const { data: colorLibData, error: colorLibError } = await supabase
                .from('product_colors')
                .select('*')
                .order('name')
            if (colorLibError) console.warn('product_colors:', colorLibError)

            setOrders(ordersData || [])
            setCustomers(customersData || [])
            setProducts(productsData || [])
            setProductColors(colorLibData || [])
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            if (!silent) setLoading(false)
        }
    }

    loadDataRef.current = loadData
    loadTrashOrdersRef.current = loadTrashOrders

    async function switchOrdersListView(next) {
        setMergeSelection({})
        setOrdersListView(next)
        if (next === 'trash') await loadTrashOrders()
    }

    function dedupeProducts(list) {
        const seen = new Set()
        return list.filter((p) => {
            const id = String(p.id)
            if (seen.has(id)) return false
            seen.add(id)
            return true
        })
    }

    /**
     * Kod bo‘yicha qidiruv (soddalashtirilgan):
     * 1) To‘liq mos: «Kod» (size) → keyin nom/tavsif/kategoriya (butun qator bilan bir xil).
     * 2) Qisman: faqat «Kod» maydoni ichida (min. 3 belgi); bitta topilganda oladi, bir nechta bo‘lsa — aniqroq yozing.
     */
    function getProductsByModelCode(code) {
        const raw = (code || '').trim()
        if (!raw) return { list: [], reason: 'empty' }
        const low = normalizeModelKey(raw)

        const exactBySize = products.filter((p) => normalizeModelKey(p.size) === low)
        if (exactBySize.length >= 1) return { list: dedupeProducts(exactBySize), reason: null }

        const exactByAnyName = products.filter((p) =>
            productNameFields(p).some((f) => normalizeModelKey(f) === low)
        )
        if (exactByAnyName.length >= 1) return { list: dedupeProducts(exactByAnyName), reason: null }

        const exactByDescription = products.filter((p) =>
            productDescriptionFields(p).some((f) => normalizeModelKey(f) === low)
        )
        if (exactByDescription.length >= 1) return { list: dedupeProducts(exactByDescription), reason: null }

        const exactByCategoryText = products.filter(
            (p) => p.category != null && String(p.category).trim() !== '' && normalizeModelKey(p.category) === low
        )
        if (exactByCategoryText.length >= 1) return { list: dedupeProducts(exactByCategoryText), reason: null }

        const minPartial = 3
        if (low.length < minPartial) {
            return { list: [], reason: 'notfound' }
        }
        const partialSize = products.filter((p) => {
            const sz = normalizeModelKey(p.size)
            return sz && sz.includes(low)
        })
        if (partialSize.length === 1) return { list: partialSize, reason: null }
        if (partialSize.length > 1) return { list: [], reason: 'ambiguous' }

        return { list: [], reason: 'notfound' }
    }

    /** Tahrir / import: bazadan kelgan qatorlarni mahsulot bilan boyitish (`line_db_*` — o‘zgartirilmasin) */
    function enrichOrderLinesFromDb(lines) {
        return lines.map((line) => {
            if (String(line.id || '').startsWith('line_db_')) {
                return { ...line }
            }
            let ln = { ...line }
            if (!(ln.codeInput || '').trim() && ln.product_id) {
                const prod = products.find((p) => String(p.id) === String(ln.product_id))
                if (prod?.size != null && String(prod.size).trim() !== '') {
                    ln = { ...ln, codeInput: String(prod.size) }
                }
            }
            const { list, reason } = getProductsByModelCode(ln.codeInput)
            if (!list.length) {
                let msg = t('orders.codeNotFound')
                if (reason === 'ambiguous') msg = t('orders.codeAmbiguous')
                if (reason === 'empty') msg = t('orders.codeEmpty')
                return {
                    ...ln,
                    variants: [],
                    colorChoices: [],
                    colorQtyByColor: {},
                    product_id: null,
                    product_name: '',
                    product_price: 0,
                    color: '',
                    image_url: '',
                    resolveError: msg,
                    readyForSort: false
                }
            }
            if (list.length === 1) {
                const product = list[0]
                const colorOpts = normalizeColorsArray(product)
                if (colorOpts.length > 1) {
                    return {
                        ...ln,
                        variants: [],
                        colorChoices: colorOpts,
                        colorQtyByColor: seedColorQtyForMatrix(ln, colorOpts),
                        product_id: product.id,
                        product_name: displayProductName(product),
                        product_price: Number(product.sale_price) || 0,
                        color: '',
                        image_url: product.image_url || '',
                        resolveError: '',
                        readyForSort: false
                    }
                }
                return {
                    ...ln,
                    variants: [],
                    colorChoices: [],
                    colorQtyByColor: {},
                    product_id: product.id,
                    product_name: displayProductName(product),
                    product_price: Number(product.sale_price) || 0,
                    color: colorOpts[0] || product.color || '',
                    image_url: product.image_url || '',
                    resolveError: '',
                    readyForSort: false
                }
            }
            return {
                ...ln,
                variants: list,
                colorChoices: [],
                colorQtyByColor: {},
                product_id: null,
                product_name: displayProductName(list[0]) || '',
                product_price: 0,
                color: '',
                image_url: '',
                resolveError: t('orders.pickColorVariant'),
                readyForSort: false
            }
        })
    }

    async function applyVariantToLine(lineId, productIdStr) {
        const snapshot = orderLinesRef.current
        const line = snapshot.find((l) => l.id === lineId)
        if (!line) return

        if (!productIdStr) {
            setOrderLines((prev) =>
                prev.map((l) => {
                    if (l.id !== lineId) return l
                    return {
                        ...l,
                        product_id: null,
                        product_name: displayProductName(l.variants?.[0]) || '',
                        product_price: 0,
                        color: '',
                        image_url: '',
                        colorChoices: [],
                        colorQtyByColor: {},
                        resolveError: l.variants?.length ? t('orders.pickColorVariant') : '',
                        readyForSort: false
                    }
                })
            )
            return
        }

        const pool = line.variants?.length ? line.variants : products
        const p = pool.find((x) => String(x.id) === String(productIdStr))
        if (!p) return

        if (orderLinesHasDuplicateProduct(snapshot, productIdStr, lineId)) {
            const merge = await showConfirm(t('orders.duplicateProductMergePrompt'), {
                variant: 'warning',
                confirmLabel: t('orders.duplicateMergeYes'),
                cancelLabel: t('orders.duplicateMergeNo')
            })
            if (merge) {
                const targetId = findFirstDuplicateProductLineId(snapshot, productIdStr, lineId)
                if (targetId) {
                    const resolvedLine = {
                        ...line,
                        product_id: p.id,
                        product_name: displayProductName(p),
                        product_price: Number(p.sale_price) || 0,
                        color: p.color || '',
                        image_url: p.image_url || '',
                        colorChoices: [],
                        colorQtyByColor: {},
                        resolveError: '',
                        readyForSort: false
                    }
                    setOrderLines(mergeDuplicateSourceLineIntoTarget(snapshot, targetId, resolvedLine, p))
                }
                return
            }
        }

        setOrderLines((prev) =>
            prev.map((l) => {
                if (l.id !== lineId) return l
                return {
                    ...l,
                    product_id: p.id,
                    product_name: displayProductName(p),
                    product_price: Number(p.sale_price) || 0,
                    color: p.color || '',
                    image_url: p.image_url || '',
                    colorChoices: [],
                    colorQtyByColor: {},
                    resolveError: '',
                    readyForSort: false
                }
            })
        )
    }

    async function resolveOrderLine(lineId) {
        const line = orderLinesRef.current.find((l) => l.id === lineId)
        if (!line) return

        const { list, reason } = getProductsByModelCode(line.codeInput)
        const prevSnapshot = orderLinesRef.current

        if (!list.length) {
            let msg = t('orders.codeNotFound')
            if (reason === 'ambiguous') msg = t('orders.codeAmbiguous')
            if (reason === 'empty') msg = t('orders.codeEmpty')
            const nextLine = {
                ...line,
                variants: [],
                colorChoices: [],
                colorQtyByColor: {},
                product_id: null,
                product_name: '',
                product_price: 0,
                color: '',
                image_url: '',
                resolveError: msg,
                readyForSort: false
            }
            setOrderLines((p) => p.map((l) => (l.id === lineId ? nextLine : l)))
            return
        }

        if (list.length === 1) {
            const product = list[0]
            const colorOpts = normalizeColorsArray(product)
            let nextLine
            if (colorOpts.length > 1) {
                nextLine = {
                    ...line,
                    variants: [],
                    colorChoices: colorOpts,
                    colorQtyByColor: seedColorQtyForMatrix(line, colorOpts),
                    product_id: product.id,
                    product_name: displayProductName(product),
                    product_price: Number(product.sale_price) || 0,
                    color: '',
                    image_url: product.image_url || '',
                    resolveError: '',
                    readyForSort: false
                }
            } else {
                nextLine = {
                    ...line,
                    variants: [],
                    colorChoices: [],
                    colorQtyByColor: {},
                    product_id: product.id,
                    product_name: displayProductName(product),
                    product_price: Number(product.sale_price) || 0,
                    color: colorOpts[0] || product.color || '',
                    image_url: product.image_url || '',
                    resolveError: '',
                    readyForSort: false
                }
            }

            if (orderLinesHasDuplicateProduct(prevSnapshot, product.id, lineId)) {
                const merge = await showConfirm(t('orders.duplicateProductMergePrompt'), {
                    variant: 'warning',
                    confirmLabel: t('orders.duplicateMergeYes'),
                    cancelLabel: t('orders.duplicateMergeNo')
                })
                if (merge) {
                    const targetId = findFirstDuplicateProductLineId(prevSnapshot, product.id, lineId)
                    if (targetId) {
                        setOrderLines(mergeDuplicateSourceLineIntoTarget(prevSnapshot, targetId, nextLine, product))
                    }
                    return
                }
            }

            setOrderLines((p) => p.map((l) => (l.id === lineId ? nextLine : l)))
            return
        }

        const nextLine = {
            ...line,
            variants: list,
            colorChoices: [],
            colorQtyByColor: {},
            product_id: null,
            product_name: displayProductName(list[0]) || '',
            product_price: 0,
            color: '',
            image_url: '',
            resolveError: t('orders.pickColorVariant'),
            readyForSort: false
        }
        setOrderLines((p) => p.map((l) => (l.id === lineId ? nextLine : l)))
    }

    function updateOrderLine(lineId, patch) {
        setOrderLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
    }

    function updateOrderLineColorQty(lineId, colorKey, value) {
        setOrderLines((prev) =>
            prev.map((l) => {
                if (l.id !== lineId) return l
                return {
                    ...l,
                    colorQtyByColor: { ...(l.colorQtyByColor || {}), [colorKey]: value },
                    resolveError: ''
                }
            })
        )
    }

    function addOrderLine() {
        setOrderLines((prev) => [...prev, createEmptyOrderLine()])
    }

    function removeOrderLine(lineId) {
        setOrderLines((prev) => {
            const next = prev.filter((l) => l.id !== lineId)
            return next.length ? next : [createEmptyOrderLine()]
        })
    }

    function commitLineToSortOrder(lineId) {
        setOrderLines((prev) =>
            prev.map((l) => (l.id === lineId && l.product_id ? { ...l, readyForSort: true } : l))
        )
    }

    async function handleSubmit(e) {
        e.preventDefault()
        const nameTrim = (form.customer_name || '').trim()
        if (!nameTrim) {
            await showAlert(t('orders.customerNameRequired'), { variant: 'warning' })
            return
        }
        if (savingOrderRef.current) return
        savingOrderRef.current = true
        setIsSavingOrder(true)

        try {
            const oldOrder = editId ? orders.find(o => String(o.id) === String(editId)) : null
            const oldStatus = oldOrder?.status || null

            const customer = form.customer_id ? customers.find((c) => c.id === form.customer_id) : null
            const resolvedCustomerName =
                nameTrim || customer?.name || ''

            const resolvedPhone = (form.customer_phone || '').trim() || customer?.phone || ''

            const linesForSave = orderLines.map((l) => (l.product_id ? { ...l, readyForSort: true } : l))

            const unresolvedFetch = orderLines.filter((l) => (l.codeInput || '').trim() && !l.product_id)
                if (unresolvedFetch.length) {
                    await showAlert(t('orders.orderLinesUnresolved'), { variant: 'warning' })
                    return
                }
                const expandedRows = mergeExpandedRowsForSubmit(
                    linesForSave.flatMap(expandOrderLineForSubmit),
                    products
                )
                if (expandedRows.length === 0) {
                    await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
                    return
                }
                const computedTotal =
                    Math.round(
                        expandedRows.reduce((s, row) => {
                            const acc = Number(s) || 0
                            const pr = Number(row.product_price) || 0
                            const q = parseInt(String(row.quantity ?? '0'), 10) || 0
                            return acc + pr * q
                        }, 0) * 100
                    ) / 100
                const totalSum =
                    mergeSourceAgg != null ? mergeSourceAgg.subtotal : computedTotal

                const qtyByProductId = new Map()
                for (const row of expandedRows) {
                    const pid = String(row.product_id)
                    const q = parseInt(String(row.quantity ?? '0'), 10) || 0
                    qtyByProductId.set(pid, (Number(qtyByProductId.get(pid)) || 0) + q)
                }
                const stockIssues = []
                for (const [pid, qty] of qtyByProductId) {
                    const prod = products.find((p) => String(p.id) === pid)
                    if (!prod) continue
                    const st = prod.stock
                    if (st != null && st !== '' && Number.isFinite(Number(st)) && Number(st) >= 0 && qty > Number(st)) {
                        stockIssues.push(
                            `${prod.name || displayProductName(prod)}: ${t('orders.stockLabel')} ${st}, ${t('orders.qtyLabel')} ${qty}`
                        )
                    }
                }
                if (stockIssues.length) {
                    const ok = await showConfirm(
                        `${stockIssues.join('\n')}\n\n${t('orders.stockWarningConfirm')}`,
                        { title: t('orders.stockWarningTitle'), variant: 'warning' }
                    )
                    if (!ok) return
                }

                const noteCombined = (form.note || '').trim()

                const displayOrderNo = generateDisplayOrderNumber()
                const baseOrderPayload = {
                    customer_id: form.customer_id || null,
                    customer_name: resolvedCustomerName,
                    customer_phone: resolvedPhone,
                    total: totalSum,
                    status:
                        form.status === 'new' || form.status === 'Yangi'
                            ? 'new'
                            : form.status === 'pending' || form.status === 'Jarayonda'
                              ? 'pending'
                              : form.status === 'completed' || form.status === 'Tugallandi'
                                ? 'completed'
                                : form.status === 'cancelled' || form.status === 'Bekor qilindi'
                                  ? 'cancelled'
                                  : form.status,
                    note: noteCombined,
                    source: normalizeSourceForDb(form.source)
                }

                const makeItemPayloads = (orderId) =>
                    expandedRows.map((line, idx) => {
                        const prod = products.find((p) => String(p.id) === String(line.product_id))
                        const qtyRaw = parseOrderItemQty(line.quantity)
                        const qty = qtyRaw > 0 ? qtyRaw : 1
                        const rawPrice = Number(line.product_price)
                        const pr = Number.isFinite(rawPrice) ? Math.round(rawPrice * 100) / 100 : 0
                        const subtotal = Math.round(pr * qty * 100) / 100
                        const colorVal = line.color ?? prod?.color
                        const imgVal =
                            line.image_url != null && String(line.image_url).trim() !== ''
                                ? String(line.image_url).trim()
                                : prod?.image_url != null && String(prod.image_url).trim() !== ''
                                  ? String(prod.image_url).trim()
                                  : null
                        /** `orderItemToFormLine` / `orderItemsToOrderLines` bilan bir xil: avvalo forma kodini saqlash */
                        const sizeForDb =
                            line.codeInput != null && String(line.codeInput).trim() !== ''
                                ? String(line.codeInput).trim()
                                : prod?.size != null && String(prod.size).trim() !== ''
                                  ? String(prod.size).trim()
                                  : null
                        const lineNoteDb =
                            line.line_note != null && String(line.line_note).trim() !== ''
                                ? String(line.line_note).trim()
                                : null
                        return {
                            order_id: orderId,
                            product_id: line.product_id,
                            product_name: (line.product_name || displayProductName(prod) || '').trim() || 'Mahsulot',
                            quantity: qty,
                            price: pr,
                            subtotal,
                            size: sizeForDb,
                            color: colorVal != null && colorVal !== '' ? String(colorVal) : null,
                            image_url: imgVal != null && imgVal !== '' ? String(imgVal) : null,
                            line_note: lineNoteDb,
                            line_index: idx
                        }
                    })

                if (editId) {
                    const orderIdStr = String(editId)
                    const itemPayloadsEdit = mergeOrderItemPayloadsForDb(makeItemPayloads(orderIdStr), products)
                    if (!itemPayloadsEdit.length) {
                        await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
                        return
                    }

                    const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', orderIdStr)
                    if (delErr) throw delErr

                    const { error: itemErrorEdit } = await supabase.from('order_items').insert(itemPayloadsEdit)
                    if (itemErrorEdit) throw itemErrorEdit

                    const { error: updErr } = await supabase.from('orders').update(baseOrderPayload).eq('id', orderIdStr)
                    if (updErr) throw updErr

                    // Stock Automation for Edit
                    const newStatus = baseOrderPayload.status
                    if (newStatus !== oldStatus) {
                        const items = itemPayloadsEdit
                        const num = oldOrder?.order_number || orderIdStr
                        if (newStatus === 'completed') {
                            await deductStockForCompletedOrder(orderIdStr, num, items)
                            showToast(t('orders.stockDeductedOk') || 'Ombor qoldig\'i yangilandi', { type: 'success' })
                        } else if (oldStatus === 'completed') {
                            await reverseStockForOrder(orderIdStr, num, items)
                            showToast(t('orders.stockReversedOk') || 'Ombor qoldig\'i qaytarildi', { type: 'info' })
                        }
                    }

                    setForm({

                        customer_id: '',
                        customer_name: '',
                        customer_phone: '',
                        total: '',
                        status: 'new',
                        note: '',
                        source: 'dokon'
                    })
                    setOrderLines([createEmptyOrderLine()])
                    setEditId(null)
                    setIsAdding(false)
                    setMergeSourceAgg(null)
                    setMergeSourceOrderIds(null)
                    loadData({ silent: true })
                    return
                }

                let newOrder = null
                let ins = await supabase
                    .from('orders')
                    .insert([{ ...baseOrderPayload, order_number: displayOrderNo }])
                    .select()
                    .single()

                const errMsg = ins.error ? String(ins.error.message || ins.error) : ''
                if (ins.error && /order_number|column.*does not exist|schema cache/i.test(errMsg)) {
                    ins = await supabase
                        .from('orders')
                        .insert([
                            {
                                ...baseOrderPayload,
                                note: `${t('orders.orderNumberPrefix')} ${displayOrderNo}\n${noteCombined || ''}`
                            }
                        ])
                        .select()
                        .single()
                } else if (ins.error) {
                    throw ins.error
                }
                if (ins.error) throw ins.error
                newOrder = ins.data

                try {
                    const snap = {
                        customer_name: form.customer_name,
                        customer_phone: form.customer_phone,
                        customer_id: form.customer_id,
                        lines: linesForSave
                            .filter((l) => l.product_id)
                            .map((l) => ({
                                codeInput: l.codeInput,
                                quantity: l.quantity,
                                product_id: l.product_id,
                                product_name: l.product_name,
                                product_price: l.product_price,
                                color: l.color,
                                image_url: l.image_url,
                                colorChoices: l.colorChoices || [],
                                colorQtyByColor: l.colorQtyByColor || {},
                                local_note: l.local_note || ''
                            }))
                    }
                    localStorage.setItem(LS_LAST_ORDER, JSON.stringify(snap))
                } catch (e) {
                    console.warn('localStorage', e)
                }

                const orderId = newOrder.id

                const itemPayloads = mergeOrderItemPayloadsForDb(makeItemPayloads(orderId), products)
                if (!itemPayloads.length) {
                    await supabase.from('orders').delete().eq('id', orderId)
                    setMergeSourceOrderIds(null)
                    await showAlert(t('orders.orderLinesEmpty'), { variant: 'warning' })
                    return
                }

                const { error: itemError } = await supabase.from('order_items').insert(itemPayloads)

                if (itemError) {
                    await supabase.from('orders').delete().eq('id', orderId)
                    setMergeSourceOrderIds(null)
                    throw itemError
                }

                // Stock Automation for New Order
                if (baseOrderPayload.status === 'completed') {
                    await deductStockForCompletedOrder(orderId, displayOrderNo, itemPayloads)
                    showToast(t('orders.stockDeductedOk') || 'Ombor qoldig\'i yangilandi', { type: 'success' })
                }


                const sourceIdsToArchive = mergeSourceOrderIds
                const shouldArchive = mergeArchiveSources ? sourceIdsToArchive : null
                if (shouldArchive?.length >= 2) {
                    const ts = new Date().toISOString()
                    const { error: archErr } = await supabase
                        .from('orders')
                        .update({ deleted_at: ts })
                        .in('id', shouldArchive)
                    if (archErr) {
                        if (isDeletedAtMissingError(archErr)) {
                            await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
                        } else {
                            await showAlert(archErr.message || String(archErr), {
                                title: t('common.saveError'),
                                variant: 'error',
                            })
                        }
                    } else {
                        setMergeSelection((prev) => {
                            const next = { ...prev }
                            for (const sid of shouldArchive) delete next[sid]
                            return next
                        })
                        showToast(t('orders.mergeArchiveSourcesDone'), { type: 'success' })
                        await loadTrashOrdersRef.current?.()
                    }
                }
                setMergeSourceOrderIds(null)

                try {
                    const num = newOrder?.order_number || displayOrderNo
                    const message = `🛍 Yangi Buyurtma\n№ ${num}\n\n👤 Mijoz: ${resolvedCustomerName}\n📞 ${resolvedPhone || '—'}\n💰 Summa: $${totalSum}`
                    await sendTelegramNotification(message)
                } catch (tgErr) {
                    console.warn('Telegram:', tgErr)
                }
                clearNewOrderDraft()

                setForm({
                    customer_id: '',
                    customer_name: '',
                    customer_phone: '',
                    total: '',
                    status: 'new',
                    note: '',
                    source: 'dokon'
                })
                setOrderLines([createEmptyOrderLine()])
                setIsAdding(false)
                setMergeSourceAgg(null)
                loadData({ silent: true })
        } catch (error) {
            console.error('Error saving order:', error)
            const msg =
                error?.message ||
                error?.error_description ||
                (typeof error === 'string' ? error : JSON.stringify(error))
            const hint = error?.hint ? `\n${error.hint}` : ''
            const details = error?.details ? `\n${error.details}` : ''
            await showAlert(`${msg}${details}${hint}`, {
                title: t('common.saveError'),
                variant: 'error',
            })
        } finally {
            savingOrderRef.current = false
            setIsSavingOrder(false)
        }
    }

    async function handleDelete(id) {
        if (!(await showConfirm(t('orders.softDeleteConfirm'), { variant: 'warning' }))) return

        try {
            const { error } = await supabase
                .from('orders')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id)

            if (error) {
                if (isDeletedAtMissingError(error)) {
                    await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
                    return
                }
                throw error
            }
            setMergeSelection((prev) => {
                const next = { ...prev }
                delete next[id]
                return next
            })
            await loadData({ silent: true })
            if (ordersListViewRef.current === 'trash') await loadTrashOrders()
        } catch (error) {
            console.error('Error deleting order:', error)
            await showAlert(t('common.deleteError'), { variant: 'error' })
        }
    }

    async function handleRestoreOrder(id) {
        try {
            const { error } = await supabase.from('orders').update({ deleted_at: null }).eq('id', id)
            if (error) {
                if (isDeletedAtMissingError(error)) {
                    await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
                    return
                }
                throw error
            }
            await loadData({ silent: true })
            await loadTrashOrders()
        } catch (error) {
            console.error('Error restoring order:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }

    async function handlePermanentDelete(id) {
        if (!(await showConfirm(t('orders.permanentDeleteConfirm'), { variant: 'warning' }))) return

        try {
            const { error } = await supabase.from('orders').delete().eq('id', id)
            if (error) throw error
            setMergeSelection((prev) => {
                const next = { ...prev }
                delete next[id]
                return next
            })
            await loadData({ silent: true })
            await loadTrashOrders()
        } catch (error) {
            console.error('Error permanently deleting order:', error)
            await showAlert(t('common.deleteError'), { variant: 'error' })
        }
    }

    async function handleEdit(item) {
        editLoadSeqRef.current += 1
        const seq = editLoadSeqRef.current
        const orderId = item.id

        const { data: rows, error } = await fetchOrderItemsForOrderId(orderId)

        if (error) {
            console.error('handleEdit order_items:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
            return
        }
        if (seq !== editLoadSeqRef.current) return

        setMergeSourceAgg(null)
        setMergeSourceOrderIds(null)
        const linesRaw = orderItemsToOrderLines(dedupeOrderItemsKeepNewest(rows || [], products), products)
        const lines = enrichOrderLinesFromDb(linesRaw)

        setForm({
            customer_id: item.customer_id || '',
            customer_name: item.customer_name || item.customers?.name || '',
            customer_phone: item.customer_phone || item.customers?.phone || '',
            total: item.total != null ? String(item.total) : '',
            status: normalizeStatusForSelect(item.status),
            note: item.note || '',
            source: normalizeSourceForForm(item.source)
        })
        setOrderLines(lines)
        setEditId(orderId)
        setIsAdding(true)
    }

    async function handleDuplicateOrder(item) {
        editLoadSeqRef.current += 1
        const seq = editLoadSeqRef.current
        const orderId = item.id

        const { data: rows, error } = await fetchOrderItemsForOrderId(orderId)

        if (error) {
            console.error('handleDuplicateOrder order_items:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
            return
        }
        if (seq !== editLoadSeqRef.current) return

        setMergeSourceAgg(null)
        setMergeSourceOrderIds(null)
        const linesRaw = orderItemsToOrderLines(dedupeOrderItemsKeepNewest(rows || [], products), products)
        const linesEnriched = enrichOrderLinesFromDb(linesRaw)
        const lines = linesEnriched.map((l) => {
            const base = createEmptyOrderLine()
            const { id: _omitId, ...rest } = l
            return { ...base, ...rest, id: base.id }
        })

        const refNo =
            item.order_number != null && String(item.order_number).trim() !== ''
                ? String(item.order_number).trim()
                : String(item.id).slice(0, 8)
        const dupLine = `${t('orders.duplicateFromOrder')} ${refNo}`
        const origNote = (item.note || '').trim()
        const noteCombined = origNote ? `${origNote}\n\n${dupLine}` : dupLine

        setForm({
            customer_id: item.customer_id || '',
            customer_name: item.customer_name || item.customers?.name || '',
            customer_phone: item.customer_phone || item.customers?.phone || '',
            total: item.total != null ? String(item.total) : '',
            status: 'new',
            note: noteCombined,
            source: normalizeSourceForForm(item.source)
        })
        setOrderLines(lines.length ? lines : [createEmptyOrderLine()])
        setEditId(null)
        setIsAdding(true)
        showToast(t('orders.duplicateOrderOpened'), { type: 'success' })
    }

    async function handleStatusChange(id, newStatus) {
        const order = orders.find((o) => o.id === id)
        if (!order) return

        const oldStatus = order.status
        if (oldStatus === newStatus) return

        try {
            const stamp = new Date().toISOString()
            let { error } = await supabase
                .from('orders')
                .update({ status: newStatus, updated_at: stamp })
                .eq('id', id)

            if (
                error &&
                /updated_at|column|does not exist|42703|schema cache/i.test(String(error.message || ''))
            ) {
                ;({ error } = await supabase.from('orders').update({ status: newStatus }).eq('id', id))
            }

            if (error) throw error

            // 1. Stock Automation: Deduct or reverse
            const orderItems = order.order_items || []
            const orderNum = order.order_number || order.id

            if (newStatus === 'completed') {
                // Yangi holat 'completed' bo'lsa - ombordan ayirish
                await deductStockForCompletedOrder(id, orderNum, orderItems)
                showToast(t('orders.stockDeductedOk') || 'Ombor qoldig\'i yangilandi', { type: 'success' })
            } else if (oldStatus === 'completed') {
                // Oldin 'completed' bo'lgan bo'lsa va endi boshqasiga o'tsa - qoldiqni qaytarish
                await reverseStockForOrder(id, orderNum, orderItems)
                showToast(t('orders.stockReversedOk') || 'Ombor qoldig\'i qaytarildi', { type: 'info' })
            }

            setOrders((prev) =>
                prev.map((o) =>
                    o.id === id ? { ...o, status: newStatus, updated_at: stamp } : o
                )
            )
        } catch (error) {
            console.error('Error updating status:', error)
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }


    function handleCancel() {
        clearNewOrderDraft()
        setDraftBanner(false)
        setMergeSourceAgg(null)
        setMergeSourceOrderIds(null)
        setEditId(null)
        setForm({
            customer_id: '',
            customer_name: '',
            customer_phone: '',
            total: '',
            status: 'new',
            note: '',
            source: 'dokon'
        })
        setIsAdding(false)
        setOrderLines([createEmptyOrderLine()])
    }

    function restoreNewOrderDraft() {
        const d = loadNewOrderDraft()
        if (!d) {
            setDraftBanner(false)
            return
        }
        setMergeSourceAgg(null)
        setMergeSourceOrderIds(null)
        setForm(
            d.form || {
                customer_id: '',
                customer_name: '',
                customer_phone: '',
                total: '',
                status: 'new',
                note: '',
                source: 'dokon'
            }
        )
        const lines =
            Array.isArray(d.orderLines) && d.orderLines.length
                ? d.orderLines.map((ln, i) => ({
                      ...createEmptyOrderLine(),
                      ...ln,
                      id: ln.id || `line_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`
                  }))
                : [createEmptyOrderLine()]
        setOrderLines(lines)
        setEditId(null)
        setIsAdding(true)
        setDraftBanner(false)
    }

    function dismissNewOrderDraftBanner() {
        clearNewOrderDraft()
        setDraftBanner(false)
    }

    async function repeatLastOrder() {
        try {
            const raw = localStorage.getItem(LS_LAST_ORDER)
            if (!raw) {
                await showAlert(t('orders.repeatNone'), { variant: 'info' })
                return
            }
            const d = JSON.parse(raw)
            setEditId(null)
            setMergeSourceAgg(null)
            setMergeSourceOrderIds(null)
            setForm((f) => ({
                ...f,
                customer_name: d.customer_name || '',
                customer_phone: d.customer_phone || '',
                customer_id: d.customer_id || ''
            }))
            if (d.lines?.length) {
                const lines = d.lines.map((ln, idx) => {
                    const colorChoices = Array.isArray(ln.colorChoices) ? ln.colorChoices : []
                    const fromSnap =
                        ln.colorQtyByColor && typeof ln.colorQtyByColor === 'object' ? { ...ln.colorQtyByColor } : {}
                    const colorQtyByColor =
                        colorChoices.length > 1 && Object.keys(fromSnap).length === 0
                            ? Object.fromEntries(colorChoices.map((c) => [c, '0']))
                            : fromSnap
                    return {
                        ...createEmptyOrderLine(),
                        id: `line_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 9)}`,
                        codeInput: ln.codeInput || '',
                        quantity: ln.quantity != null ? String(ln.quantity) : '1',
                        product_id: ln.product_id || null,
                        product_name: ln.product_name || '',
                        product_price: Number(ln.product_price) || 0,
                        color: ln.color || '',
                        image_url: ln.image_url || '',
                        resolveError: '',
                        variants: [],
                        colorChoices,
                        colorQtyByColor,
                        readyForSort: ln.product_id ? true : false
                    }
                })
                setOrderLines(lines)
            }
            setIsAdding(true)
        } catch (e) {
            console.error(e)
            await showAlert(t('orders.repeatError'), { variant: 'error' })
        }
    }

    const selectedMergeCount = useMemo(
        () => Object.keys(mergeSelection).filter((id) => mergeSelection[id]).length,
        [mergeSelection]
    )

    function toggleMergeSelectOrder(id) {
        setMergeSelection((prev) => ({ ...prev, [id]: !prev[id] }))
    }

    function toggleMergeSelectAllFiltered() {
        const allOnPage = filteredOrders.map((o) => o.id)
        if (!allOnPage.length) return
        const allSelected = allOnPage.every((id) => mergeSelection[id])
        if (allSelected) {
            setMergeSelection((prev) => {
                const next = { ...prev }
                for (const id of allOnPage) delete next[id]
                return next
            })
        } else {
            setMergeSelection((prev) => {
                const next = { ...prev }
                for (const id of allOnPage) next[id] = true
                return next
            })
        }
    }

    function clearMergeSelection() {
        setMergeSelection({})
    }

    async function handleMergeSelectedOrders() {
        if (ordersListView !== 'active') return
        const ids = Object.keys(mergeSelection).filter((id) => mergeSelection[id])
        if (ids.length < 2) {
            await showAlert(t('orders.mergeNeedTwo'), { variant: 'warning' })
            return
        }
        const idSet = new Set(ids)
        const ordersToMerge = filteredOrders
            .filter((o) => idSet.has(o.id))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        if (ordersToMerge.length < 2) {
            await showAlert(t('orders.mergeNeedTwo'), { variant: 'warning' })
            return
        }
        try {
            const { data: allRows, error } = await fetchOrderItemsForOrderIds(ordersToMerge.map((o) => o.id))
            if (error) throw error
            const cleanedRows = normalizeOrderItemsForList(allRows || [])
            if (!cleanedRows.length) {
                await showAlert(t('orders.mergeEmptyLines'), { variant: 'warning' })
                return
            }
            const byOrderId = new Map()
            for (const oi of cleanedRows) {
                const oid = oi?.order_id
                if (oid == null || oid === '') continue
                const k = String(oid)
                if (!byOrderId.has(k)) byOrderId.set(k, [])
                byOrderId.get(k).push(oi)
            }
            const mergeRowsDeduped = []
            for (const o of ordersToMerge) {
                mergeRowsDeduped.push(...dedupeOrderItemsKeepNewest(byOrderId.get(String(o.id)) || [], products))
            }
            const orderRank = new Map(ordersToMerge.map((o, i) => [String(o.id), i]))
            const sortedForForm = [...mergeRowsDeduped].sort((a, b) => {
                const ra = orderRank.get(String(a.order_id)) ?? 999
                const rb = orderRank.get(String(b.order_id)) ?? 999
                if (ra !== rb) return ra - rb
                const la = Number(a.line_index ?? 0)
                const lb = Number(b.line_index ?? 0)
                if (la !== lb) return la - lb
                return String(a.id || '').localeCompare(String(b.id || ''))
            })
            setMergeSourceAgg(aggregateMergedOrdersTotals(ordersToMerge, mergeRowsDeduped))
            setMergeSourceOrderIds(ordersToMerge.map((o) => o.id))
            const linesRaw = orderItemsToOrderLines(sortedForForm, products)
            const lines = enrichOrderLinesFromDb(linesRaw)
            const labels = ordersToMerge.map((o) =>
                o.order_number ? `№ ${o.order_number}` : `#${String(o.id).slice(0, 8)}`
            )
            const mergeNote = `${t('orders.mergeNotePrefix')}: ${labels.join('; ')}`
            const primary = ordersToMerge[0]
            const custName = primary.customer_name || primary.customers?.name || ''
            const custPhone = primary.customer_phone || primary.customers?.phone || ''
            const custId = primary.customer_id || ''
            clearNewOrderDraft()
            setDraftBanner(false)
            setEditId(null)
            setForm({
                customer_id: custId || '',
                customer_name: custName,
                customer_phone: custPhone,
                total: '',
                status: 'new',
                note: mergeNote,
                source: normalizeSourceForForm(primary.source)
            })
            setOrderLines(lines.length ? lines : [createEmptyOrderLine()])
            setMergeSelection({})
            setMergeArchiveSources(true)
            setIsAdding(true)
            showToast(t('orders.mergeOpenedForm'), { type: 'success' })
            requestAnimationFrame(() => {
                orderFormPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
        } catch (e) {
            console.error('handleMergeSelectedOrders:', e)
            await showAlert(t('orders.mergeFetchError'), { variant: 'error' })
        }
    }

    async function handlePrintOrder(item, showPrices) {
        const labelColorFn = (c) => labelColorCanonical(c, productColors, language)
        let orderForPrint = item
        try {
            const { data: rows, error: oiErr } = await fetchOrderItemsForOrderId(item.id)
            if (oiErr) throw oiErr
            const { data: orderRow, error: ordErr } = await supabase
                .from('orders')
                .select(`*, customers (id, name, phone)`)
                .eq('id', item.id)
                .single()
            if (ordErr) throw ordErr
            orderForPrint = {
                ...item,
                ...orderRow,
                order_items: dedupeOrderItemsKeepNewest(rows || [], products)
            }
        } catch (e) {
            console.error('handlePrintOrder refetch:', e)
            orderForPrint = { ...item, order_items: dedupeOrderItemsKeepNewest(item.order_items || [], products) }
        }
        const html = buildPrintDocumentHtml({
            documentTitle: `Buyurtma-${String(item.id).slice(0, 8)}`,
            listTitle: '',
            orders: [orderForPrint],
            showPrices,
            labelColorFn,
            productsList: products,
            tableConfig
        })
        if (!openPrintTab(html)) {
            showToast(t('orders.printPopupBlocked') || 'Brauzer chop etish oynasini bloklagan. Popup ruxsat bering.', {
                type: 'info',
            })
        }
    }

    async function handlePrintOrderList(list, showPrices) {
        if (!list?.length) {
            await showAlert(t('orders.listPrintEmpty'), { variant: 'info' })
            return
        }
        const labelColorFn = (c) => labelColorCanonical(c, productColors, language)
        const ids = list.map((o) => o.id).filter(Boolean)
        let ordersForPrint = list
        try {
            const { data: allRows, error } = await fetchOrderItemsForOrderIds(ids)
            if (error) throw error
            const byOrder = new Map()
            for (const oi of allRows || []) {
                const oid = oi.order_id
                if (!byOrder.has(oid)) byOrder.set(oid, [])
                byOrder.get(oid).push(oi)
            }
            ordersForPrint = list.map((o) => ({
                ...o,
                order_items: dedupeOrderItemsKeepNewest(byOrder.get(o.id) || o.order_items || [], products)
            }))
        } catch (e) {
            console.error('handlePrintOrderList refetch:', e)
            ordersForPrint = list.map((o) => ({
                ...o,
                order_items: dedupeOrderItemsKeepNewest(o.order_items || [], products)
            }))
        }
        const html = buildPrintDocumentHtml({
            documentTitle: showPrices ? t('orders.listPrintTitleWithPrices') : t('orders.listPrintTitleNoPrices'),
            listTitle: `${t('orders.listPrintCount')}: ${list.length}`,
            orders: ordersForPrint,
            showPrices,
            labelColorFn,
            productsList: products,
            tableConfig
        })
        if (!openPrintTab(html)) {
            showToast(t('orders.printPopupBlocked') || 'Popup bloklangan.', { type: 'info' })
        }
    }

    async function handlePrintSelectedByCategory(list, categoryLabel) {
        if (!list?.length) {
            await showAlert(t('orders.listPrintEmpty'), { variant: 'info' })
            return
        }
        const labelColorFn = (c) => labelColorCanonical(c, productColors, language)
        const ids = list.map((o) => o.id).filter(Boolean)
        let ordersForPrint = list
        try {
            const { data: allRows, error } = await fetchOrderItemsForOrderIds(ids)
            if (error) throw error
            const byOrder = new Map()
            for (const oi of allRows || []) {
                const oid = oi.order_id
                if (!byOrder.has(oid)) byOrder.set(oid, [])
                byOrder.get(oid).push(oi)
            }
            ordersForPrint = list
                .map((o) => {
                    const rows = dedupeOrderItemsKeepNewest(byOrder.get(o.id) || o.order_items || [], products)
                    const categoryRows = filterOrderItemsByCategoryLabel(rows, categoryLabel, '—')
                    return { ...o, order_items: categoryRows }
                })
                .filter((o) => (o.order_items || []).length > 0)
        } catch (e) {
            console.error('handlePrintSelectedByCategory refetch:', e)
            ordersForPrint = list
                .map((o) => {
                    const rows = dedupeOrderItemsKeepNewest(o.order_items || [], products)
                    const categoryRows = filterOrderItemsByCategoryLabel(rows, categoryLabel, '—')
                    return { ...o, order_items: categoryRows }
                })
                .filter((o) => (o.order_items || []).length > 0)
        }

        if (!ordersForPrint.length) {
            await showAlert(t('orders.listPrintEmpty'), { variant: 'info' })
            return
        }

        const html = buildConsolidatedPrintHtml({
            documentTitle: `Bulk-Category-${categoryLabel || 'All'}`,
            listTitle: categoryLabel && categoryLabel !== 'all' 
                ? `Kategoriya: ${categoryLabel} | Umumlashtirilgan ro'yxat` 
                : "Umumlashtirilgan kategoriya ro'yxati",
            orders: ordersForPrint,
            showPrices: false,
            labelColorFn,
            productsList: products,
            tableConfig
        })
        if (!openPrintTab(html)) {
            showToast(t('orders.printPopupBlocked') || 'Popup bloklangan.', { type: 'info' })
        }
    }

    const orderLinesSubtotal = useMemo(() => computeOrderLinesSubtotal(orderLines), [orderLines])
    const displayFormSubtotal =
        mergeSourceAgg != null ? mergeSourceAgg.subtotal : orderLinesSubtotal
    const formImageCellClass =
        tableConfig.imageSize === 'sm'
            ? 'w-16 h-16 min-w-[4rem] max-w-[4rem] min-h-[4rem] max-h-[4rem]'
            : tableConfig.imageSize === 'lg'
              ? 'w-28 h-28 min-w-[7rem] max-w-[7rem] min-h-[7rem] max-h-[7rem]'
              : 'w-24 h-24 min-w-[6rem] max-w-[6rem] min-h-[6rem] max-h-[6rem]'
    const orderFormTableRows = useMemo(
        () => buildOrderFormTableRows(orderLines, products, language, t('orders.categoryUncategorized')),
        [orderLines, products, language, t]
    )
    const firstCodeLineId = useMemo(
        () =>
            orderFormTableRows.find((r) => r.type === 'line' && !r.line.product_id)?.line?.id ??
            orderFormTableRows.find((r) => r.type === 'line')?.line?.id,
        [orderFormTableRows]
    )
    const ordersForList = ordersListView === 'active' ? orders : trashOrders
    const orderCategoryOptions = useMemo(() => {
        const countByLabel = new Map()
        for (const o of ordersForList) {
            for (const label of orderCategoryLabels(o, '—')) {
                countByLabel.set(label, (countByLabel.get(label) || 0) + 1)
            }
        }
        return Array.from(countByLabel.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'uz'))
            .map(([label, count]) => ({ label, count }))
    }, [ordersForList])

    function orderMatchesListFilters(b) {
        const customerName = b.customer_name || b.customers?.name || t('common.unknown') || 'Noma\'lum'
        const q = searchTerm.trim().toLowerCase()
        const matchesSearch =
            !q ||
            customerName.toLowerCase().includes(q) ||
            String(b.customer_phone || b.customers?.phone || '')
                .toLowerCase()
                .includes(q) ||
            String(b.id || '')
                .toLowerCase()
                .includes(q) ||
            String(b.order_number || '')
                .toLowerCase()
                .includes(q)
        const st = b.status
        const labels = orderCategoryLabels(b, '—')
        const matchesCategory = filterCategory === 'all' || labels.includes(filterCategory)
        const matchesStatus =
            filterStatus === 'all' ||
            filterStatus === 'Hammasi' ||
            (filterStatus === 'new' && (st === 'new' || st === 'Yangi')) ||
            (filterStatus === 'pending' && (st === 'pending' || st === 'Jarayonda')) ||
            (filterStatus === 'completed' && (st === 'completed' || st === 'Tugallandi' || st === 'Tugallangan')) ||
            (filterStatus === 'cancelled' &&
                (st === 'cancelled' || st === 'Bekor qilingan' || st === 'Bekor qilindi'))
        return matchesSearch && matchesStatus && matchesCategory
    }

    /** Jadval va yuqori kartalar bir xil `filteredOrders` dan — jami va statuslar mos keladi */
    const filteredOrders = ordersForList.filter(orderMatchesListFilters)
    const totalSumma = filteredOrders.reduce((sum, b) => sum + (Number(b.total) || 0), 0)
    const sumOrderListTotals = (list) =>
        Math.round(list.reduce((s, b) => s + (Number(b.total) || 0), 0) * 100) / 100
    const statusPick = (pred) => {
        const list = filteredOrders.filter(pred)
        return { count: list.length, sum: sumOrderListTotals(list) }
    }
    const statusStats = {
        new: statusPick((b) => b.status === 'Yangi' || b.status === 'new'),
        pending: statusPick((b) => b.status === 'Jarayonda' || b.status === 'pending'),
        completed: statusPick(
            (b) =>
                b.status === 'Tugallandi' ||
                b.status === 'completed' ||
                b.status === 'Tugallangan'
        )
    }

    const highlightOrderId = searchParams.get('highlight')

    useEffect(() => {
        if (loading || !highlightOrderId || ordersListView !== 'active') return
        const inList = filteredOrders.some((o) => String(o.id) === highlightOrderId)
        if (!inList) return
        const tmr = window.setTimeout(() => {
            const el = document.getElementById(`order-row-${highlightOrderId}`)
            if (!el) return
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'bg-blue-50/90')
            window.setTimeout(() => {
                el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'bg-blue-50/90')
            }, 4500)
        }, 400)
        return () => window.clearTimeout(tmr)
    }, [loading, highlightOrderId, ordersListView, filteredOrders])

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                </div>
            </div>
        )
    }



    return (
        <div className="w-full max-w-none xl:max-w-[min(100%,112rem)] 2xl:max-w-[min(100%,120rem)] mx-auto">
            <Header title={t('common.orders')} toggleSidebar={toggleSidebar} />

            {ordersListView === 'trash' ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                    <p className="font-medium leading-snug">{t('orders.trashHint')}</p>
                </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                    type="button"
                    onClick={() => switchOrdersListView('active')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                        ordersListView === 'active'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    <ShoppingCart size={16} />
                    {t('orders.activeList')}
                </button>
                <button
                    type="button"
                    onClick={() => switchOrdersListView('trash')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                        ordersListView === 'trash'
                            ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    <Archive size={16} />
                    {t('orders.trashBin')}
                    {trashOrderCount > 0 ? (
                        <span className="min-w-[1.5rem] rounded-full bg-white/20 px-1.5 text-center text-xs tabular-nums">
                            {trashOrderCount}
                        </span>
                    ) : null}
                </button>
            </div>

            <StatsCards 
                t={t}
                statusStats={statusStats}
                totalSumma={totalSumma}
                filteredOrdersCount={filteredOrders.length}
                onStatusClick={setFilterStatus}
                activeStatus={filterStatus}
            />

            {ordersListView === 'active' && (
                <StatusTabs 
                    t={t}
                    filterStatus={filterStatus}
                    setFilterStatus={setFilterStatus}
                    statusStats={statusStats}
                />
            )}

            {draftBanner && !isAdding ? (
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                    <p className="font-medium">{t('orders.draftRestorePrompt')}</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={restoreNewOrderDraft}
                            className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700"
                        >
                            {t('orders.draftContinue')}
                        </button>
                        <button
                            type="button"
                            onClick={dismissNewOrderDraftBanner}
                            className="rounded-xl border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-900 hover:bg-amber-100"
                        >
                            {t('orders.draftDiscard')}
                        </button>
                    </div>
                </div>
            ) : null}

            <OrdersFilter
                t={t}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                repeatLastOrder={repeatLastOrder}
                ordersListView={ordersListView}
                handleMergeSelectedOrders={handleMergeSelectedOrders}
                selectedMergeCount={selectedMergeCount}
                clearMergeSelection={clearMergeSelection}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                filterCategory={filterCategory}
                setFilterCategory={setFilterCategory}
                orderCategoryOptions={orderCategoryOptions}
                handlePrintOrderList={handlePrintOrderList}
                filteredOrders={filteredOrders}
                handlePrintSelectedByCategory={handlePrintSelectedByCategory}
                selectedOrders={selectedOrders}
                isAdding={isAdding}
                handleCancel={handleCancel}
                clearNewOrderDraft={clearNewOrderDraft}
                setDraftBanner={setDraftBanner}
                setEditId={setEditId}
                setOrderLines={setOrderLines}
                setForm={setForm}
                setMergeSourceAgg={setMergeSourceAgg}
                setMergeSourceOrderIds={setMergeSourceOrderIds}
                setIsAdding={setIsAdding}
                createEmptyOrderLine={createEmptyOrderLine}
            />

            <OrderFormDialog
                t={t}
                isAdding={isAdding}
                editId={editId}
                orderFormPanelRef={orderFormPanelRef}
                handleSubmit={handleSubmit}
                form={form}
                setForm={setForm}
                customers={customers}
                tableConfig={tableConfig}
                setTableConfig={setTableConfig}
                orderFormTableRows={orderFormTableRows}
                firstCodeLineId={firstCodeLineId}
                firstModelCodeRef={firstModelCodeRef}
                updateOrderLine={updateOrderLine}
                resolveOrderLine={resolveOrderLine}
                applyVariantToLine={applyVariantToLine}
                updateOrderLineColorQty={updateOrderLineColorQty}
                removeOrderLine={removeOrderLine}
                commitLineToSortOrder={commitLineToSortOrder}
                addOrderLine={addOrderLine}
                isSavingOrder={isSavingOrder}
                handleCancel={handleCancel}
                productColors={productColors}
                language={language}
                products={products}
            />

            <OrdersTable
                t={t}
                filteredOrders={filteredOrders}
                ordersListView={ordersListView}
                mergeSelection={mergeSelection}
                toggleMergeSelectAllFiltered={toggleMergeSelectAllFiltered}
                toggleMergeSelectOrder={toggleMergeSelectOrder}
                language={language}
                products={products}
                productColors={productColors}
                orderListExpandedById={orderListExpandedById}
                setOrderListExpandedById={setOrderListExpandedById}
                handleStatusChange={handleStatusChange}
                handlePrintOrder={handlePrintOrder}
                handleDuplicateOrder={handleDuplicateOrder}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                handleRestoreOrder={handleRestoreOrder}
                handlePermanentDelete={handlePermanentDelete}
            />
        </div>
    )
}

export default function Buyurtmalar() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center p-8">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
                </div>
            }
        >
            <BuyurtmalarPageContent />
        </Suspense>
    )
}