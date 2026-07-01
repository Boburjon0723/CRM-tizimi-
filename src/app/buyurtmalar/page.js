'use client'

import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatUsd } from '@/utils/formatters'
import { normalizeModelKey } from '@/utils/validators'
import { deductStockForCompletedOrder, reverseStockForOrder } from '@/services/inventoryService'

import Header from '@/components/Header'
import {
    Plus,
    Clock,
    FileText,
} from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { isDeletedAtMissingError } from '@/lib/orderTrash'

import {
    escapeHtml,
    parseOrderItemQty,
    parseOrderItemPrice,
    parseOptionalMoneyCell,
    orderItemLineNoteText,
    mergeLineNotes,
    isSchemaOrEmbedError,
    fetchOrdersPageWithFallback,
    fetchDeletedOrdersPageWithFallback,
    fetchOrderItemsForOrderId,
    fetchOrderItemsForOrderIds,
    displayProductName,
    labelColorCanonical,
    expandOrderLineForSubmit,
    LS_LAST_ORDER,
    SESSION_NEW_ORDER_DRAFT,
    loadNewOrderDraft,
    clearNewOrderDraft,
    draftHasMeaningfulContent,
    generateDisplayOrderNumber,
    buildCrmQatorlarExcelRows,
    exportOrdersExcelRowsToFile,
    readOrdersImportWorkbookRows,
    normalizeImportedExcelCellKey,
    normalizeImportedExcelRow,
    canonicalizeExcelImportRow,
    groupImportedExcelRowsToOrders,
    buildItemPayloadsFromExpandedLines,
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
    buildSpecialPrintHtml,
    openPrintTab,
    normalizeSourceForDb,
    normalizeSourceForForm,
    normalizeStatusForSelect,
    ORDER_LIST_ITEMS_PREVIEW,
    createEmptyOrderLine,
    DEFAULT_TABLE_CONFIG,
    imagePxBySize,
    dedupeOrderItemsById,
    normalizeOrderItemsForList,
    orderItemToFormLine,
    orderItemsToOrderLines,
    aggregateMergedOrdersTotals,
    filterOrderItemsByCategoryLabel,
    buildConsolidatedPrintHtml
} from './utils'

import StatsCards from './components/StatsCards'
import StatusTabs from './components/StatusTabs'
import OrdersFilter from './components/OrdersFilter'
import OrdersTable from './components/OrdersTable'
import OrdersViewTabs from './components/OrdersViewTabs'
import DraftRestoreBanner from './components/DraftRestoreBanner'
import LinkCustomerModal from './components/LinkCustomerModal'
import OrderFormPanel from './components/OrderFormPanel'
import { useOrderListFilters } from './hooks/useOrderListFilters'
import { enrichOrderLinesFromDb, createDefaultOrderForm, getProductsByModelCode } from './lib/orderFormUtils'
import { getOutstandingItemsForDeduction } from './lib/partialShipUtils'







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
    /** Forma sessiyasi — `OrderFormPanel` uchun boshlang'ich ma'lumot */
    const [formSession, setFormSession] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    /** `all` bo‘lishi shart — `Hammasi` bilan hech qachon `matchesStatus` true bo‘lmaydi */
    const [filterStatus, setFilterStatus] = useState('all')
    /** Buyurtmalar ro‘yxatida mahsulot kategoriyasi bo‘yicha filter */
    const [filterCategory, setFilterCategory] = useState('all')
    /** Bir nechta buyurtmani bitta yangi buyurtmaga birlashtirish uchun tanlov */
    const [mergeSelection, setMergeSelection] = useState({})
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

    const selectedOrders = useMemo(() => {
        const list = ordersListView === 'active' ? orders : trashOrders
        return list.filter((o) => mergeSelection[o.id])
    }, [ordersListView, orders, trashOrders, mergeSelection])


    const editLoadSeqRef = useRef(0)
    const excelImportInputRef = useRef(null)
    const [excelImportBusy, setExcelImportBusy] = useState(false)
    const [draftBanner, setDraftBanner] = useState(false)
    const [linkCustomerOrder, setLinkCustomerOrder] = useState(null)
    const isAddingRef = useRef(isAdding)

    useEffect(() => {
        isAddingRef.current = isAdding
    }, [isAdding])

    function openOrderForm(session) {
        setFormSession({
            key: session.key ?? `${session.editId ?? 'new'}-${Date.now()}`,
            editId: session.editId ?? null,
            initialForm: session.initialForm ?? createDefaultOrderForm(),
            initialOrderLines: session.initialOrderLines ?? [createEmptyOrderLine()],
            mergeSourceAgg: session.mergeSourceAgg ?? null,
            mergeSourceOrderIds: session.mergeSourceOrderIds ?? null,
            mergeArchiveSources: session.mergeArchiveSources ?? true,
        })
        setIsAdding(true)
    }

    function closeOrderForm() {
        setIsAdding(false)
        setFormSession(null)
    }

    const handleFormSaved = useCallback(async () => {
        await loadDataRef.current?.({ silent: true })
    }, [])

    const handleMergeArchived = useCallback((ids) => {
        setMergeSelection((prev) => {
            const next = { ...prev }
            for (const sid of ids) delete next[sid]
            return next
        })
    }, [])

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

    function handleLinkCustomer(order) {
        setLinkCustomerOrder(order)
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

        const linesRaw = orderItemsToOrderLines(dedupeOrderItemsKeepNewest(rows || [], products), products)
        const lines = enrichOrderLinesFromDb(linesRaw, products, t)

        openOrderForm({
            editId: orderId,
            initialForm: {
                customer_id: item.customer_id || '',
                customer_name: item.customer_name || item.customers?.name || '',
                customer_phone: item.customer_phone || item.customers?.phone || '',
                total: item.total != null ? String(item.total) : '',
                status: normalizeStatusForSelect(item.status),
                note: item.note || '',
                source: normalizeSourceForForm(item.source),
            },
            initialOrderLines: lines,
        })
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

        const linesRaw = orderItemsToOrderLines(dedupeOrderItemsKeepNewest(rows || [], products), products)
        const linesEnriched = enrichOrderLinesFromDb(linesRaw, products, t)
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

        openOrderForm({
            editId: null,
            initialForm: {
                customer_id: item.customer_id || '',
                customer_name: item.customer_name || item.customers?.name || '',
                customer_phone: item.customer_phone || item.customers?.phone || '',
                total: item.total != null ? String(item.total) : '',
                status: 'new',
                note: noteCombined,
                source: normalizeSourceForForm(item.source),
            },
            initialOrderLines: lines.length ? lines : [createEmptyOrderLine()],
        })
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
                // Qisman jo'natish bo'lgan bo'lsa ham faqat qolgan qismini ayiramiz.
                const outstanding = await getOutstandingItemsForDeduction(id, orderItems)
                if (outstanding.length > 0) {
                    await deductStockForCompletedOrder(id, orderNum, outstanding)
                    showToast(t('orders.stockDeductedOk') || 'Ombor qoldig\'i yangilandi', { type: 'success' })
                } else {
                    showToast(t('orders.stockAlreadyDeducted') || 'Bu buyurtma bo‘yicha chiqim avval yozilgan', {
                        type: 'info',
                    })
                }
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
        closeOrderForm()
    }

    function restoreNewOrderDraft() {
        const d = loadNewOrderDraft()
        if (!d) {
            setDraftBanner(false)
            return
        }
        const lines =
            Array.isArray(d.orderLines) && d.orderLines.length
                ? d.orderLines.map((ln, i) => ({
                      ...createEmptyOrderLine(),
                      ...ln,
                      id: ln.id || `line_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`,
                  }))
                : [createEmptyOrderLine()]
        openOrderForm({
            editId: null,
            initialForm: d.form || createDefaultOrderForm(),
            initialOrderLines: lines,
        })
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
            const lines = d.lines?.length
                ? d.lines.map((ln, idx) => {
                      const colorChoices = Array.isArray(ln.colorChoices) ? ln.colorChoices : []
                      const fromSnap =
                          ln.colorQtyByColor && typeof ln.colorQtyByColor === 'object'
                              ? { ...ln.colorQtyByColor }
                              : {}
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
                          readyForSort: ln.product_id ? true : false,
                      }
                  })
                : [createEmptyOrderLine()]
            openOrderForm({
                editId: null,
                initialForm: {
                    ...createDefaultOrderForm(),
                    customer_name: d.customer_name || '',
                    customer_phone: d.customer_phone || '',
                    customer_id: d.customer_id || '',
                },
                initialOrderLines: lines,
            })
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
            const mergeAgg = aggregateMergedOrdersTotals(ordersToMerge, mergeRowsDeduped)
            const linesRaw = orderItemsToOrderLines(sortedForForm, products)
            const lines = enrichOrderLinesFromDb(linesRaw, products, t)
            const labels = ordersToMerge.map((o) =>
                o.order_number ? `№ ${o.order_number}` : `#${String(o.id).slice(0, 8)}`
            )
            const mergeNote = `${t('orders.mergeNotePrefix')}: ${labels.join('; ')}`
            const primary = ordersToMerge[0]
            clearNewOrderDraft()
            setDraftBanner(false)
            setMergeSelection({})
            openOrderForm({
                editId: null,
                initialForm: {
                    customer_id: primary.customer_id || '',
                    customer_name: primary.customer_name || primary.customers?.name || '',
                    customer_phone: primary.customer_phone || primary.customers?.phone || '',
                    total: '',
                    status: 'new',
                    note: mergeNote,
                    source: normalizeSourceForForm(primary.source),
                },
                initialOrderLines: lines.length ? lines : [createEmptyOrderLine()],
                mergeSourceAgg: mergeAgg,
                mergeSourceOrderIds: ordersToMerge.map((o) => o.id),
                mergeArchiveSources: true,
            })
            showToast(t('orders.mergeOpenedForm'), { type: 'success' })
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

    async function handlePrintSelectedSpecial(list) {
        if (!list?.length) {
            await showAlert(t('orders.listPrintEmpty') || 'Chop etish uchun buyurtmalar tanlanmagan', { variant: 'info' })
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
            console.error('handlePrintSelectedSpecial refetch:', e)
            ordersForPrint = list.map((o) => ({
                ...o,
                order_items: dedupeOrderItemsKeepNewest(o.order_items || [], products)
            }))
        }

        const html = buildSpecialPrintHtml({
            documentTitle: "Maxsus Chop Etish Hujjati",
            listTitle: `Tanlangan buyurtmalar soni: ${list.length}`,
            orders: ordersForPrint,
            labelColorFn,
            productsList: products,
            tableConfig
        })
        if (!openPrintTab(html)) {
            showToast(t('orders.printPopupBlocked') || 'Popup bloklangan.', { type: 'info' })
        }
    }

    const ordersForList = ordersListView === 'active' ? orders : trashOrders
    const unknownLabel = t('common.unknown')
    const { filteredOrders, totalSumma, statusStats, orderCategoryOptions } = useOrderListFilters({
        ordersForList,
        searchTerm,
        filterStatus,
        filterCategory,
        unknownLabel,
    })

    const highlightOrderId = searchParams.get('highlight')

    const KNOWN_EXCEL_IMPORT_HEADERS = new Set([
        'дата', 'клиент', 'наименование', 'код', 'цвет', 'кол-во', 'цена', 'сумма', 'фото',
        'customer_name', 'customer_phone', 'model_code', 'product_name', 'image_url', 'quantity', 'unit_price',
        'line_total', 'order_created_at', 'order_number', 'order_status', 'order_note', 'order_source',
        'payment_detail', 'payment_method_detail', 'line_note', 'product_id', 'import_group', 'import_gr',
        'line_index', 'order_id', 'mijoz', 'telefon', 'phone', 'kod', 'rang', 'miqdor', 'narx', 'sana',
        'buyurtma', 'buyurtma_raqami', 'izoh', 'buyurtma_izohi', 'source', 'status', 'created_at',
        'tolov', 'mahsulot_kodi', 'size', 'mahsulot', 'mahsulot_nomi', 'qator_miqdori', 'birlik_narxi',
        'qator_izohi', 'productid', 'guruh', 'lineindex', 'mahsulot_tartib_raqami', 'tartib_raqami',
        'kimniki_ekanligi'
    ])

    function importRowRef(row) {
        const n = Number(row?.__excel_row)
        return Number.isFinite(n) && n > 0 ? `Qator ${n}` : 'Qator ?'
    }

    function excelColumnLabel(n) {
        let x = Number(n) || 0
        if (x <= 0) return '?'
        let s = ''
        while (x > 0) {
            const rem = (x - 1) % 26
            s = String.fromCharCode(65 + rem) + s
            x = Math.floor((x - 1) / 26)
        }
        return s
    }
    function resolveProductForExcelImportRow(row) {
        const pid = row.product_id
        if (pid !== undefined && pid !== null && String(pid).trim() !== '') {
            const p = products.find((x) => String(x.id) === String(pid).trim())
            if (p) return { list: [p], reason: null }
        }
        const code = String(row.model_code || '').trim()
        if (!code) return { list: [], reason: 'empty' }
        const pname = String(row.product_name || '').trim()
        const byKey = (s) => {
            if (!s) return { list: [], reason: 'empty' }
            return getProductsByModelCode(products, s)
        }
        if (code) {
            const byCode = byKey(code)
            if (byCode.list?.length === 1) return byCode
            if (byCode.list && byCode.list.length > 1) return byCode
            if (pname && normalizeModelKey(pname) !== normalizeModelKey(code)) {
                const byName = byKey(pname)
                if (byName.list?.length) return byName
            }
            return byCode
        }
        if (pname) return byKey(pname)
        return { list: [], reason: 'empty' }
    }

    async function persistImportedExcelOrderGroup(group) {
        const first = group[0]
        const linesForMerge = []
        for (const row of group) {
            const res = resolveProductForExcelImportRow(row)
            if (!res.list?.length) {
                const codeLabel = String(row.model_code || '').trim() || '—'
                const msgCore =
                    res.reason === 'empty'
                        ? t('orders.codeEmpty')
                        : res.reason === 'ambiguous'
                          ? t('orders.codeAmbiguous')
                          : t('orders.codeNotFound')
                throw new Error(`${importRowRef(row)}: ${msgCore} (Kod: ${codeLabel})`)
            }
            if (res.list.length > 1) {
                throw new Error(
                    `${importRowRef(row)}: ${t('orders.codeAmbiguous')} (${String(row.model_code || '').trim() || '—'})`
                )
            }
            const product = res.list[0]
            const qty = parseOrderItemQty(row.quantity)
            if (qty <= 0) {
                throw new Error(
                    `${importRowRef(row)}: ${t('orders.excelImportBadQty')} (Кол-во: ${String(row.quantity ?? '') || '—'})`
                )
            }
            const up = parseOptionalMoneyCell(row.unit_price)
            const price =
                up != null && up >= 0
                    ? Math.round(up * 100) / 100
                    : Number(product.sale_price) || 0
            linesForMerge.push({
                id: `line_imp_${gi}_${idx}_${Date.now()}`,
                keepSeparate: true,
                product_id: product.id,
                product_name: String(row.product_name || '').trim() || displayProductName(product),
                product_price: price,
                quantity: String(qty),
                color: String(row.color || '').trim(),
                codeInput:
                    String(row.model_code || '').trim() ||
                    (product.size ? String(product.size) : ''),
                line_note: String(row.line_note || '').trim()
            })
        }
        const expandedRows = mergeExpandedRowsForSubmit(linesForMerge, products)
        if (!expandedRows.length) throw new Error(t('orders.orderLinesEmpty'))
        const itemPayloads = mergeOrderItemPayloadsForDb(
            buildItemPayloadsFromExpandedLines('new', expandedRows, products),
            products
        )
        if (!itemPayloads.length) throw new Error(t('orders.orderLinesEmpty'))
        const totalSum =
            Math.round(itemPayloads.reduce((s, p) => s + (Number(p.subtotal) || 0), 0) * 100) / 100

        const st = normalizeStatusForSelect(first.order_status || 'completed')
        const statusDb = st === 'completed' ? 'completed' : st

        const baseOrderPayload = {
            customer_id: null,
            customer_name: (first.customer_name || '').trim() || 'Mijoz',
            customer_phone: (first.customer_phone || '').trim(),
            total: totalSum,
            status: statusDb,
            note: (first.order_note || '').trim(),
            source: normalizeSourceForDb(first.order_source || 'dokon')
        }
        const pd = first.payment_detail ?? first.payment_method_detail
        if (pd != null && String(pd).trim()) {
            baseOrderPayload.payment_method_detail = String(pd).trim()
        }

        const displayOrderNo = generateDisplayOrderNumber()
        let insertPayload = { ...baseOrderPayload, order_number: displayOrderNo }
        const rawCa = first.order_created_at
        const parseImportedCreatedAtIso = (raw) => {
            const s = String(raw ?? '').trim()
            if (!s) return null
            const direct = new Date(s)
            if (!Number.isNaN(direct.getTime())) return direct.toISOString()
            const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/)
            if (!m) return null
            const dd = Number(m[1])
            const mm = Number(m[2])
            const yyRaw = Number(m[3])
            const hh = Number(m[4] || 0)
            const mi = Number(m[5] || 0)
            const yy = yyRaw < 100 ? 2000 + yyRaw : yyRaw
            const dt = new Date(yy, mm - 1, dd, hh, mi, 0)
            if (Number.isNaN(dt.getTime())) return null
            return dt.toISOString()
        }
        const createdAtIso = parseImportedCreatedAtIso(rawCa)
        if (createdAtIso) {
            insertPayload.created_at = createdAtIso
        }

        let ins = await supabase.from('orders').insert([insertPayload]).select().single()
        const errMsg = ins.error ? String(ins.error.message || ins.error) : ''
        if (ins.error && /order_number|column.*does not exist|schema cache/i.test(errMsg)) {
            insertPayload = {
                ...baseOrderPayload,
                note: `${t('orders.orderNumberPrefix')} ${displayOrderNo}\n${baseOrderPayload.note || ''}`
            }
            if (createdAtIso) insertPayload.created_at = createdAtIso
            ins = await supabase.from('orders').insert([insertPayload]).select().single()
        }
        if (ins.error) throw ins.error

        const orderId = ins.data?.id
        if (!orderId) throw new Error('orders.insert: no id')
        const rowsInsert = itemPayloads.map((p, idx) => ({
            ...p,
            order_id: orderId,
            line_index: typeof p.line_index === 'number' ? p.line_index : idx
        }))

        const { error: itemError } = await supabase.from('order_items').insert(rowsInsert)
        if (itemError) {
            await supabase.from('orders').delete().eq('id', orderId)
            throw itemError
        }

        if (baseOrderPayload.status === 'completed') {
            await deductStockForCompletedOrder(orderId, displayOrderNo, rowsInsert)
        }
    }

    async function handleExportSelectedOrdersExcel(includeImages = true) {
        if (!selectedOrders.length) {
            void showAlert(t('orders.excelExportSelectFirst'), { variant: 'warning' })
            return
        }
        const rows = buildCrmQatorlarExcelRows(selectedOrders, products, {
            onlyCompleted: false,
            includePhotoColumn: includeImages
        })
        if (!rows.length) {
            void showAlert(t('orders.excelExportNoLines'), { variant: 'warning' })
            return
        }
        const totals = rows.reduce(
            (acc, row) => {
                const qty = Number(row?.['Кол-во'])
                const sum = Number(row?.['Сумма'])
                if (Number.isFinite(qty)) acc.qty += qty
                if (Number.isFinite(sum)) acc.sum += sum
                return acc
            },
            { qty: 0, sum: 0 }
        )
        const qtyLabel = Number.isInteger(totals.qty) ? String(totals.qty) : String(Math.round(totals.qty * 1000) / 1000)
        const sumLabel = formatUsd(Math.round(totals.sum * 100) / 100)
        const stamp = new Date().toISOString().slice(0, 10)
        await exportOrdersExcelRowsToFile(rows, `crm-buyurtmalar-${stamp}.xlsx`, 'CRM_qatorlar', {
            includeEmbeddedImages: includeImages
        })
        showToast(
            `${selectedOrders.length} ${t('orders.excelExportToastOrders')}, ${rows.length} ${t('orders.excelExportToastLines')} — ${t('orders.excelExportToastTotalQty')}: ${qtyLabel}, ${t('orders.excelExportToastTotalAmount')}: $${sumLabel} — ${includeImages ? t('orders.excelExportSavedWithImages') : t('orders.excelExportSavedWithoutImages')}`,
            { type: 'success' }
        )
    }

    async function handleExcelImportFileChange(e) {
        const file = e.target.files?.[0]
        if (e.target) e.target.value = ''
        if (!file || excelImportBusy) return
        setExcelImportBusy(true)
        try {
            const buf = await file.arrayBuffer()
            const rawRows = readOrdersImportWorkbookRows(buf)
            if (!rawRows.length) {
                await showAlert(t('orders.excelImportNoRows'), { variant: 'warning' })
                return
            }
            const rawHeaders = Object.keys(rawRows[0] || {})
            const headerKeys = rawHeaders.map((k) => normalizeImportedExcelCellKey(k))
            const unknownHeaders = headerKeys
                .map((k, idx) => ({ key: k, col: excelColumnLabel(idx + 1) }))
                .filter(({ key }) => key && !/^__empty(_\d+)?$/.test(key) && !KNOWN_EXCEL_IMPORT_HEADERS.has(key))
            if (unknownHeaders.length) {
                await showAlert(
                    `Excelda noma'lum ustun topildi:\n- ${unknownHeaders.map((x) => `${x.key} (ustun ${x.col})`).join('\n- ')}\n\n1-qator (header)dagi shu ustun nomini tekshiring yoki o'chirib qayta import qiling.`,
                    { variant: 'warning' }
                )
                return
            }

            const hasProductNameColumn =
                headerKeys.includes('наименование') || headerKeys.includes('product_name') || headerKeys.includes('mahsulot')
            const hasCodeColumn = headerKeys.includes('код') || headerKeys.includes('model_code') || headerKeys.includes('kod')
            const hasQtyColumn = headerKeys.includes('кол-во') || headerKeys.includes('quantity') || headerKeys.includes('miqdor')
            if (!hasQtyColumn || (!hasCodeColumn && !hasProductNameColumn)) {
                await showAlert(
                    `Excel import uchun majburiy ustunlar topilmadi.\nKerakli: "Кол-во" va mahsulotni topish uchun "Код" yoki "Наименование" (formadagi model kodi maydoni bilan bir xil qoida).`,
                    { variant: 'warning' }
                )
                return
            }

            const preparedRows = rawRows.map((raw, idx) => {
                const canonical = canonicalizeExcelImportRow(normalizeImportedExcelRow(raw))
                return { ...canonical, __excel_row: idx + 2 }
            })

            const groups = groupImportedExcelRowsToOrders(preparedRows)
            const validGroups = groups.filter((g) => g.length)
            if (!validGroups.length) {
                await showAlert(t('orders.excelImportNoRows'), { variant: 'warning' })
                return
            }
            const ok = await showConfirm(
                `${t('orders.excelImportConfirm')} (${validGroups.length})`,
                { variant: 'info' }
            )
            if (!ok) return

            let okCount = 0
            const errLines = []
            for (let gi = 0; gi < validGroups.length; gi++) {
                try {
                    await persistImportedExcelOrderGroup(validGroups[gi])
                    okCount++
                } catch (err) {
                    errLines.push(`${gi + 1}. ${err?.message || String(err)}`)
                }
            }
            await loadData({ silent: true })
            if (errLines.length) {
                await showAlert(
                    `${t('orders.excelImportPartial')} ${okCount}/${validGroups.length}\n\n${errLines.join('\n')}`,
                    { variant: 'warning' }
                )
            } else {
                showToast(`${okCount} ${t('orders.excelImportDone')}`, { type: 'success' })
            }
        } catch (err) {
            console.error(err)
            await showAlert(err?.message || String(err), {
                title: t('orders.excelImportErrorTitle'),
                variant: 'error'
            })
        } finally {
            setExcelImportBusy(false)
        }
    }

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

            <OrdersViewTabs
                t={t}
                ordersListView={ordersListView}
                trashOrderCount={trashOrderCount}
                onSwitchView={switchOrdersListView}
            />

            <StatsCards
                t={t}
                statusStats={statusStats}
                totalSumma={totalSumma}
                filteredOrdersCount={filteredOrders.length}
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
                <DraftRestoreBanner
                    t={t}
                    onRestore={restoreNewOrderDraft}
                    onDismiss={dismissNewOrderDraftBanner}
                />
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
                filterCategory={filterCategory}
                setFilterCategory={setFilterCategory}
                orderCategoryOptions={orderCategoryOptions}
                handlePrintOrderList={handlePrintOrderList}
                filteredOrders={filteredOrders}
                handlePrintSelectedByCategory={handlePrintSelectedByCategory}
                handlePrintSelectedSpecial={handlePrintSelectedSpecial}
                selectedOrders={selectedOrders}
                isAdding={isAdding}
                onOpenNewOrder={() =>
                    openOrderForm({
                        initialForm: createDefaultOrderForm(),
                        initialOrderLines: [createEmptyOrderLine()],
                    })
                }
                onCancelForm={handleCancel}
                clearNewOrderDraft={clearNewOrderDraft}
                setDraftBanner={setDraftBanner}
                handleExportSelectedOrdersExcel={handleExportSelectedOrdersExcel}
                selectedOrdersCount={selectedOrders.length}
                excelImportInputRef={excelImportInputRef}
                handleExcelImportFileChange={handleExcelImportFileChange}
                excelImportBusy={excelImportBusy}
            />

            {isAdding && formSession ? (
                <OrderFormPanel
                    key={formSession.key}
                    editId={formSession.editId}
                    initialForm={formSession.initialForm}
                    initialOrderLines={formSession.initialOrderLines}
                    mergeSourceAgg={formSession.mergeSourceAgg}
                    mergeSourceOrderIds={formSession.mergeSourceOrderIds}
                    mergeArchiveSources={formSession.mergeArchiveSources}
                    products={products}
                    customers={customers}
                    productColors={productColors}
                    orders={orders}
                    tableConfig={tableConfig}
                    setTableConfig={setTableConfig}
                    onClose={closeOrderForm}
                    onSaved={handleFormSaved}
                    onMergeArchived={handleMergeArchived}
                    loadTrashOrders={loadTrashOrders}
                />
            ) : null}

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
                handleLinkCustomer={handleLinkCustomer}
            />

            {linkCustomerOrder ? (
                <LinkCustomerModal
                    order={linkCustomerOrder}
                    customers={customers}
                    onClose={() => setLinkCustomerOrder(null)}
                    onSuccess={() => loadData({ silent: true })}
                />
            ) : null}
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