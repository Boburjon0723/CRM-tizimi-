'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ArrowLeft,
    Plus,
    Users,
    ShoppingCart,
    Pencil,
    Printer,
    Receipt,
    PackageCheck,
    Eye,
    EyeOff,
    Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isDeletedAtMissingError } from '@/lib/orderTrash'
import Header from '@/components/Header'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { formatUsd } from '@/utils/formatters'
import OrderFormPanel from '@/app/buyurtmalar/components/OrderFormPanel'
import PartialShipModal from '@/app/buyurtmalar/components/PartialShipModal'
import { saveBuyurtma2Order } from '@/app/buyurtmalar2/lib/saveBuyurtma2Order'
import {
    createDefaultOrderForm,
    enrichOrderLinesFromDb,
} from '@/app/buyurtmalar/lib/orderFormUtils'
import {
    attachFulfillmentToOrders,
    computeOrderFulfillment,
    loadOrderShippedMap,
    buildShippedPortionOrderItems,
    fetchLatestOrderShipDate,
} from '@/app/buyurtmalar/lib/partialShipUtils'
import {
    createEmptyOrderLine,
    DEFAULT_TABLE_CONFIG,
    fetchOrdersPageWithFallback,
    fetchOrderItemsForOrderId,
    normalizeStatusForSelect,
    orderItemsToOrderLines,
    updateOrderStatusWithCompletedAt,
    buildPrintDocumentHtml,
    openPrintTab,
    filterOrderItemsByCategoryLabel,
    labelColorCanonical,
    dedupeOrderItemsKeepNewest,
    categoryLabelFromProduct,
    sortOrdersByCompletionSequence,
} from '@/app/buyurtmalar/utils'

const WORKSPACE = 'buyurtmalar2'

function statusLabel(status, t) {
    const s = normalizeStatusForSelect(status)
    if (s === 'pending') return t('orders2.statusPending')
    if (s === 'completed') return t('orders2.statusCompleted')
    if (s === 'cancelled') return t('orders2.statusCancelled')
    return t('orders2.statusNew')
}

function statusBadgeClass(status) {
    const s = normalizeStatusForSelect(status)
    if (s === 'pending') return 'bg-amber-100 text-amber-800'
    if (s === 'completed') return 'bg-emerald-100 text-emerald-800'
    if (s === 'cancelled') return 'bg-gray-100 text-gray-500'
    return 'bg-sky-100 text-sky-800'
}

function money(v) {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/** Tugallangan yoki qisman chiqqan (ombordan hech bo‘lmasa 1 dona chiqqan) */
function isShippedOrCompletedOrder(order) {
    const s = normalizeStatusForSelect(order?.status)
    if (s === 'cancelled') return false
    if (s === 'completed') return true
    return (Number(order?.fulfillment?.shipped) || 0) > 0
}

/**
 * Umumiy «chiqqan» summa:
 * - tugallangan → buyurtma total
 * - qisman → chiqqan miqdor bo‘yicha proporsional summa
 */
function orderShippedCompletedValue(order) {
    const s = normalizeStatusForSelect(order?.status)
    if (s === 'cancelled') return 0
    if (s === 'completed') return money(order.total)
    const shipped = Number(order?.fulfillment?.shipped) || 0
    const ordered = Number(order?.fulfillment?.ordered) || 0
    if (shipped <= 0) return 0
    if (ordered > 0) {
        return Math.round(money(order.total) * (shipped / ordered) * 100) / 100
    }
    return 0
}

function formatOrderDate(iso, language) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(
        language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ',
        { day: 'numeric', month: 'short', year: 'numeric' }
    )
}

function orderNoteText(order) {
    const n = String(order?.note || '').trim()
    if (!n) return ''
    // Eski format: "Buyurtma #...\n..." — faqat foydalanuvchi eslatmasini ko‘rsatishga urinish
    const lines = n.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    if (lines.length <= 1) return lines[0] || ''
    const withoutNum = lines.filter((l) => !/^buyurtma\s*#/i.test(l) && !/^order\s*#/i.test(l))
    return (withoutNum.length ? withoutNum : lines).join(' · ')
}

function orderClientName(order) {
    return String(order?.customer_name || order?.customers?.name || '').trim()
}

function categoriesForOrder(order, products, language) {
    const set = new Set()
    for (const oi of order?.order_items || []) {
        let lab = ''
        const emb = oi?.products
        if (emb?.categories) {
            lab = categoryLabelFromProduct({ categories: emb.categories }, language)
        }
        if (!lab && oi?.product_id && products?.length) {
            const prod = products.find((p) => String(p.id) === String(oi.product_id))
            lab = categoryLabelFromProduct(prod, language)
        }
        if (lab) set.add(lab)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'uz'))
}

export default function Buyurtmalar2Page() {
    const { toggleSidebar } = useLayout()
    const { t, language } = useLanguage()
    const { showAlert, showToast, showConfirm } = useDialog()

    const [loading, setLoading] = useState(true)
    const [schemaMissing, setSchemaMissing] = useState(false)
    const [customers, setCustomers] = useState([])
    const [orders, setOrders] = useState([])
    const [products, setProducts] = useState([])
    const [productColors, setProductColors] = useState([])
    const [selectedId, setSelectedId] = useState(null)
    const [customerSearch, setCustomerSearch] = useState('')
    const [detailTab, setDetailTab] = useState('active') // active | completed
    const [customerModal, setCustomerModal] = useState(false)
    const [customerForm, setCustomerForm] = useState({ name: '', phone: '', notes: '' })
    const [savingCustomer, setSavingCustomer] = useState(false)
    const [isAdding, setIsAdding] = useState(false)
    const [formSession, setFormSession] = useState(null)
    const [tableConfig, setTableConfig] = useState(DEFAULT_TABLE_CONFIG)
    const [statusBusyId, setStatusBusyId] = useState(null)
    const [printCategoryByOrder, setPrintCategoryByOrder] = useState({})
    const [partialShipOrder, setPartialShipOrder] = useState(null)
    const [expandedOrderIds, setExpandedOrderIds] = useState(() => new Set())
    const loadSeqRef = useRef(0)

    const loadAll = useCallback(async () => {
        const seq = ++loadSeqRef.current
        try {
            setLoading(true)
            const ordersRes = await fetchOrdersPageWithFallback({
                activeOnly: true,
                workspace: WORKSPACE,
            })
            if (seq !== loadSeqRef.current) return
            if (ordersRes.error) throw ordersRes.error
            if (ordersRes.workspaceMissing) setSchemaMissing(true)
            else setSchemaMissing(false)

            const ordersList = ordersRes.data || []
            const v2CustomerIds = [
                ...new Set(
                    ordersList
                        .map((o) => (o.customer_id != null ? String(o.customer_id) : ''))
                        .filter(Boolean)
                ),
            ]

            let customersData = []
            let custRes = await supabase
                .from('customers')
                .select('id, name, phone, notes, email, address, country, workspace')
                .eq('workspace', WORKSPACE)
                .order('name')

            if (
                custRes.error &&
                /workspace|column|does not exist|42703|schema cache/i.test(String(custRes.error.message || ''))
            ) {
                // Ustun yo‘q: faqat v2 buyurtmasi bor mijozlar (Mijozlar ro‘yxati emas)
                if (v2CustomerIds.length) {
                    custRes = await supabase
                        .from('customers')
                        .select('id, name, phone, notes, email, address, country')
                        .in('id', v2CustomerIds)
                        .order('name')
                    if (custRes.error) throw custRes.error
                    customersData = custRes.data || []
                } else {
                    customersData = []
                }
            } else if (custRes.error) {
                throw custRes.error
            } else {
                customersData = custRes.data || []
                // V2 buyurtmasi bor, lekin workspace belgilanmagan eski yozuvlar
                if (v2CustomerIds.length) {
                    const have = new Set(customersData.map((c) => String(c.id)))
                    const missing = v2CustomerIds.filter((id) => !have.has(id))
                    if (missing.length) {
                        const extra = await supabase
                            .from('customers')
                            .select('id, name, phone, notes, email, address, country, workspace')
                            .in('id', missing)
                        if (!extra.error && extra.data?.length) {
                            customersData = [...customersData, ...extra.data]
                            customersData.sort((a, b) =>
                                String(a.name || '').localeCompare(String(b.name || ''), 'uz')
                            )
                        }
                    }
                }
            }

            let productsData = null
            const prWithCat = await supabase
                .from('products')
                .select('*, categories(id, name, name_uz)')
                .order('name')
            if (prWithCat.error) {
                const prFb = await supabase.from('products').select('*').order('name')
                productsData = prFb.data
            } else {
                productsData = prWithCat.data
            }

            const { data: colorLibData } = await supabase
                .from('product_colors')
                .select('*')
                .order('name')

            if (seq !== loadSeqRef.current) return

            // customer_id bo‘sh bo‘lsa — nomi bo‘yicha Buyurtmalar2 mijoziga bog‘lash
            const nameToCustomer = new Map()
            for (const c of customersData) {
                const n = String(c.name || '')
                    .trim()
                    .toLowerCase()
                if (n && !nameToCustomer.has(n)) nameToCustomer.set(n, c)
            }
            for (const o of ordersList) {
                if (o.customer_id) continue
                const n = String(o.customer_name || '')
                    .trim()
                    .toLowerCase()
                const match = n ? nameToCustomer.get(n) : null
                if (!match) continue
                const { error: linkErr } = await supabase
                    .from('orders')
                    .update({ customer_id: match.id })
                    .eq('id', o.id)
                    .eq('workspace', WORKSPACE)
                if (!linkErr) o.customer_id = match.id
            }

            setOrders(ordersList)
            setCustomers(customersData)
            setProducts(productsData || [])
            setProductColors(colorLibData || [])
            setSelectedId((prev) => {
                if (!prev) return null
                return customersData.some((c) => String(c.id) === String(prev)) ? prev : null
            })

            void attachFulfillmentToOrders(ordersList).then((enriched) => {
                if (seq !== loadSeqRef.current) return
                setOrders(enriched)
            })
        } catch (err) {
            console.error(err)
            await showAlert(err?.message || String(err), { variant: 'error' })
        } finally {
            if (seq === loadSeqRef.current) setLoading(false)
        }
    }, [showAlert])

    useEffect(() => {
        void loadAll()
    }, [loadAll])

    const selectedCustomer = useMemo(
        () => customers.find((c) => String(c.id) === String(selectedId)) || null,
        [customers, selectedId]
    )

    const statsByStatus = useMemo(() => {
        const base = {
            new: { count: 0, sum: 0 },
            pending: { count: 0, sum: 0 },
            completed: { count: 0, sum: 0 },
            cancelled: { count: 0, sum: 0 },
        }
        for (const o of orders) {
            const s = normalizeStatusForSelect(o.status)
            if (!base[s]) continue
            base[s].count += 1
            base[s].sum += money(o.total)
        }
        return base
    }, [orders])

    const totalAll = useMemo(() => {
        return orders.reduce(
            (acc, o) => {
                if (!isShippedOrCompletedOrder(o)) return acc
                acc.count += 1
                acc.sum += orderShippedCompletedValue(o)
                return acc
            },
            { count: 0, sum: 0 }
        )
    }, [orders])

    const ordersByCustomer = useMemo(() => {
        const map = new Map()
        const nameToId = new Map()
        for (const c of customers) {
            const n = String(c.name || '')
                .trim()
                .toLowerCase()
            if (n && !nameToId.has(n)) nameToId.set(n, String(c.id))
        }
        for (const o of orders) {
            let cid = o.customer_id ? String(o.customer_id) : ''
            if (!cid) {
                const n = String(o.customer_name || '')
                    .trim()
                    .toLowerCase()
                if (n) cid = nameToId.get(n) || ''
            }
            if (!cid) continue
            if (!map.has(cid)) map.set(cid, [])
            map.get(cid).push(o)
        }
        return map
    }, [orders, customers])

    const customerStats = useMemo(() => {
        const map = new Map()
        for (const [cid, list] of ordersByCustomer.entries()) {
            let activeCount = 0
            let totalSum = 0
            for (const o of list) {
                const s = normalizeStatusForSelect(o.status)
                if (s === 'new' || s === 'pending') activeCount += 1
                if (isShippedOrCompletedOrder(o)) {
                    totalSum += orderShippedCompletedValue(o)
                }
            }
            map.set(cid, { activeCount, totalSum, orderCount: list.length })
        }
        return map
    }, [ordersByCustomer])

    const visibleCustomers = useMemo(() => {
        const q = customerSearch.trim().toLowerCase()
        let list = [...customers].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'uz')
        )
        if (!q) return list
        return list.filter((c) => {
            const hay = `${c.name || ''} ${c.phone || ''} ${c.notes || ''}`.toLowerCase()
            return hay.includes(q)
        })
    }, [customers, customerSearch])

    const selectedOrders = useMemo(() => {
        if (!selectedId) return []
        return ordersByCustomer.get(String(selectedId)) || []
    }, [ordersByCustomer, selectedId])

    const selectedActiveOrders = useMemo(() => {
        const list = selectedOrders.filter((o) => {
            const s = normalizeStatusForSelect(o.status)
            return s === 'new' || s === 'pending'
        })
        return sortOrdersByCompletionSequence(list)
    }, [selectedOrders])

    const selectedCompletedOrders = useMemo(() => {
        const list = selectedOrders.filter(
            (o) => normalizeStatusForSelect(o.status) === 'completed'
        )
        return sortOrdersByCompletionSequence(list)
    }, [selectedOrders])

    const detailOrders = detailTab === 'completed' ? selectedCompletedOrders : selectedActiveOrders

    const selectedCustomerTotal = useMemo(() => {
        return selectedOrders.reduce((s, o) => {
            if (!isShippedOrCompletedOrder(o)) return s
            return s + orderShippedCompletedValue(o)
        }, 0)
    }, [selectedOrders])

    const selectedCustomerOrderTotal = useMemo(() => {
        return selectedOrders.reduce((s, o) => {
            if (normalizeStatusForSelect(o.status) === 'cancelled') return s
            return s + money(o.total)
        }, 0)
    }, [selectedOrders])

    function openCustomerModal() {
        setCustomerForm({ name: '', phone: '', notes: '' })
        setCustomerModal(true)
    }

    async function saveCustomer(e) {
        e?.preventDefault?.()
        const name = customerForm.name.trim()
        const phone = customerForm.phone.trim()
        if (!name) {
            await showAlert(t('orders2.customerRequired'), { variant: 'warning' })
            return
        }
        setSavingCustomer(true)
        try {
            const payload = {
                name,
                phone: phone || '',
                notes: customerForm.notes.trim() || null,
                email: '',
                country: '',
                address: '',
                workspace: WORKSPACE,
            }
            let { data, error } = await supabase
                .from('customers')
                .insert([payload])
                .select('id, name, phone, notes, email, address, country, workspace')
                .single()

            if (
                error &&
                /workspace|column|does not exist|42703|schema cache/i.test(String(error.message || ''))
            ) {
                await showAlert(t('orders2.customerWorkspaceMigrationHint'), { variant: 'warning' })
                return
            }
            if (error) throw error
            setCustomers((prev) => {
                const next = [...prev, data]
                next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'uz'))
                return next
            })
            setSelectedId(data.id)
            setCustomerModal(false)
            showToast(t('orders2.customerSaved'), { type: 'success' })
        } catch (err) {
            console.error(err)
            await showAlert(err?.message || String(err), { variant: 'error' })
        } finally {
            setSavingCustomer(false)
        }
    }

    function openNewOrder() {
        if (!selectedCustomer) {
            void showAlert(t('orders2.selectCustomerFirst'), { variant: 'warning' })
            return
        }
        setFormSession({
            key: `new-${selectedCustomer.id}-${Date.now()}`,
            editId: null,
            initialForm: {
                ...createDefaultOrderForm(),
                customer_id: selectedCustomer.id,
                customer_name: selectedCustomer.name || '',
                customer_phone: selectedCustomer.phone || '',
                workspace: WORKSPACE,
            },
            initialOrderLines: [createEmptyOrderLine()],
        })
        setIsAdding(true)
    }

    async function openEditOrder(order) {
        if (!order) return
        try {
            const { data: items, error } = await fetchOrderItemsForOrderId(order.id)
            if (error) throw error
            const lines = enrichOrderLinesFromDb(
                orderItemsToOrderLines(items || [], products),
                products,
                t
            )
            setFormSession({
                key: `edit-${order.id}-${Date.now()}`,
                editId: order.id,
                initialForm: {
                    ...createDefaultOrderForm(),
                    customer_id: order.customer_id || selectedCustomer?.id || '',
                    customer_name: order.customer_name || selectedCustomer?.name || '',
                    customer_phone: order.customer_phone || selectedCustomer?.phone || '',
                    status: normalizeStatusForSelect(order.status),
                    note: order.note || '',
                    source: order.source || 'dokon',
                    total: order.total != null ? String(order.total) : '',
                    workspace: WORKSPACE,
                },
                initialOrderLines: lines.length ? lines : [createEmptyOrderLine()],
            })
            setIsAdding(true)
        } catch (err) {
            console.error(err)
            await showAlert(err?.message || String(err), { variant: 'error' })
        }
    }

    async function handleDeleteOrder(order) {
        if (!order?.id) return
        if (!(await showConfirm(t('orders.softDeleteConfirm'), { variant: 'warning' }))) return
        try {
            const { error } = await supabase
                .from('orders')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', order.id)
                .eq('workspace', WORKSPACE)

            if (error) {
                if (isDeletedAtMissingError(error)) {
                    await showAlert(t('orders.deletedAtMigrationHint'), { variant: 'warning' })
                    return
                }
                throw error
            }
            showToast(t('orders2.orderMovedToTrash'), { type: 'success' })
            await loadAll()
        } catch (err) {
            console.error(err)
            await showAlert(err?.message || t('common.deleteError'), { variant: 'error' })
        }
    }

    function closeOrderForm() {
        setIsAdding(false)
        setFormSession(null)
    }

    async function handleFormSaved() {
        await loadAll()
    }

    async function handleStatusChange(order, nextStatus) {
        const normalized = normalizeStatusForSelect(nextStatus)
        const old = normalizeStatusForSelect(order.status)
        if (normalized === old) return
        setStatusBusyId(order.id)
        try {
            const { error } = await updateOrderStatusWithCompletedAt(
                supabase,
                order.id,
                normalized,
                old
            )
            if (error) throw error
            await supabase
                .from('orders')
                .update({ workspace: WORKSPACE })
                .eq('id', order.id)
            setOrders((prev) =>
                prev.map((o) =>
                    String(o.id) === String(order.id) ? { ...o, status: normalized } : o
                )
            )
            showToast(t('orders2.statusUpdated'), { type: 'success' })
            if (normalized === 'completed') setDetailTab('completed')
            else setDetailTab('active')
        } catch (err) {
            console.error(err)
            await showAlert(err?.message || String(err), { variant: 'error' })
        } finally {
            setStatusBusyId(null)
        }
    }

    async function handlePrintOrder(item, showPrices) {
        const labelColorFn = (c) => labelColorCanonical(c, productColors, language)
        const filterCategory = printCategoryByOrder[String(item.id)] || 'all'
        const categoryActive = filterCategory && filterCategory !== 'all'
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
                order_items: dedupeOrderItemsKeepNewest(rows || [], products),
            }
        } catch (e) {
            console.error('handlePrintOrder refetch:', e)
            orderForPrint = {
                ...item,
                order_items: dedupeOrderItemsKeepNewest(item.order_items || [], products),
            }
        }

        if (categoryActive) {
            const filteredItems = filterOrderItemsByCategoryLabel(
                orderForPrint.order_items || [],
                filterCategory,
                '—',
                products
            )
            if (!filteredItems.length) {
                await showAlert(t('orders.listPrintEmpty') || t('orders2.printEmptyCategory'), {
                    variant: 'info',
                })
                return
            }
            orderForPrint = { ...orderForPrint, order_items: filteredItems, total: null }
        }

        const status = normalizeStatusForSelect(orderForPrint.status)
        if (status === 'completed' && orderForPrint.completed_at) {
            orderForPrint = {
                ...orderForPrint,
                _print_date: orderForPrint.completed_at,
                _print_date_label: t('orders2.printDateCompleted') || 'Tugallangan sana',
            }
        } else if ((Number(orderForPrint.fulfillment?.shipped) || 0) > 0) {
            try {
                const shipDate = await fetchLatestOrderShipDate(orderForPrint.id)
                if (shipDate) {
                    orderForPrint = {
                        ...orderForPrint,
                        _print_date: shipDate,
                        _print_date_label: t('orders2.printDateShipped') || 'Chiqqan sana',
                    }
                }
            } catch (e) {
                console.warn('print ship date:', e)
            }
        }

        const html = buildPrintDocumentHtml({
            documentTitle: categoryActive
                ? `Buyurtma-${String(item.id).slice(0, 8)}-${filterCategory}`
                : `Buyurtma-${String(item.id).slice(0, 8)}`,
            listTitle: categoryActive ? `Kategoriya: ${filterCategory}` : '',
            orders: [orderForPrint],
            showPrices,
            labelColorFn,
            productsList: products,
            tableConfig,
        })
        if (!openPrintTab(html)) {
            showToast(
                t('orders.printPopupBlocked') ||
                    'Brauzer chop etish oynasini bloklagan. Popup ruxsat bering.',
                { type: 'info' }
            )
        }
    }

    async function handlePrintShippedPortion(item, showPrices = false) {
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
                order_items: dedupeOrderItemsKeepNewest(rows || [], products),
            }
        } catch (e) {
            console.error('handlePrintShippedPortion refetch:', e)
            orderForPrint = {
                ...item,
                order_items: dedupeOrderItemsKeepNewest(item.order_items || [], products),
            }
        }

        try {
            const shippedMap = await loadOrderShippedMap(orderForPrint.id)
            const { items, shippedTotal, orderedTotal } = buildShippedPortionOrderItems(
                orderForPrint,
                products,
                shippedMap
            )
            if (!items.length) {
                await showAlert(
                    t('orders.partialPrintEmpty') ||
                        'Chop etish uchun chiqqan mahsulot yo‘q. Avval qisman tugallang.',
                    { variant: 'info' }
                )
                return
            }

            const portionTotal = items.reduce((s, oi) => {
                const q = Number(oi.quantity) || 0
                const p = Number(oi.price) || 0
                return s + q * p
            }, 0)

            let shipDate = null
            try {
                shipDate = await fetchLatestOrderShipDate(orderForPrint.id)
            } catch (e) {
                console.warn('ship date:', e)
            }
            const status = normalizeStatusForSelect(orderForPrint.status)
            const printDate =
                shipDate ||
                (status === 'completed' ? orderForPrint.completed_at : null) ||
                orderForPrint.updated_at ||
                orderForPrint.created_at

            const html = buildPrintDocumentHtml({
                documentTitle: `Chiqqan-${String(item.order_number || item.id).slice(0, 24)}`,
                listTitle:
                    t('orders2.partialPrintListTitle') ||
                    `Qisman jo‘natilgan: ${shippedTotal}/${orderedTotal} dona`,
                orders: [
                    {
                        ...orderForPrint,
                        order_items: items,
                        total: showPrices ? portionTotal : null,
                        _print_note:
                            t('orders2.partialPrintNote') ||
                            'Diqqat: bu hujjatda faqat qisman jo‘natilgan mahsulotlar.',
                        _print_date: printDate,
                        _print_date_label:
                            t('orders2.printDateShipped') || 'Chiqqan sana',
                    },
                ],
                showPrices,
                labelColorFn,
                productsList: products,
                tableConfig,
            })
            if (!openPrintTab(html)) {
                showToast(
                    t('orders.printPopupBlocked') ||
                        'Brauzer chop etish oynasini bloklagan. Popup ruxsat bering.',
                    { type: 'info' }
                )
            }
        } catch (err) {
            console.error(err)
            await showAlert(err?.message || String(err), { variant: 'error' })
        }
    }

    function toggleExpandOrder(orderId) {
        setExpandedOrderIds((prev) => {
            const next = new Set(prev)
            const key = String(orderId)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const canPartialShip = (order) => {
        const s = normalizeStatusForSelect(order.status)
        return s === 'new' || s === 'pending'
    }

    const showList = !selectedId
    const showDetail = Boolean(selectedId)

    return (
        <div className="min-h-screen bg-gray-50/80">
            <Header title={t('orders2.title')} onMenuClick={toggleSidebar} />

            <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
                {schemaMissing ? (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {t('orders2.workspaceMigrationHint')}
                    </div>
                ) : null}

                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                    <div>
                        <p className="text-gray-500 text-sm">{t('orders2.subtitle')}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('orders2.selectHint')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={openCustomerModal}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                    >
                        <Plus size={18} />
                        {t('orders2.addCustomer')}
                    </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                        {
                            key: 'new',
                            label: t('orders2.statusNew'),
                            count: statsByStatus.new.count,
                            sum: statsByStatus.new.sum,
                        },
                        {
                            key: 'pending',
                            label: t('orders2.statusPending'),
                            count: statsByStatus.pending.count,
                            sum: statsByStatus.pending.sum,
                        },
                        {
                            key: 'completed',
                            label: t('orders2.statusCompleted'),
                            count: statsByStatus.completed.count,
                            sum: statsByStatus.completed.sum,
                        },
                        {
                            key: 'all',
                            label: t('orders2.totalShippedCompleted'),
                            count: totalAll.count,
                            sum: totalAll.sum,
                            hint: t('orders2.totalShippedCompletedHint'),
                        },
                    ].map((card) => (
                        <div
                            key={card.key}
                            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                        >
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                {card.label}
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                                {card.count}
                            </p>
                            <p className="text-sm font-semibold text-emerald-700 tabular-nums mt-1">
                                ${formatUsd(card.sum)}
                            </p>
                            {card.hint ? (
                                <p className="text-[10px] text-gray-400 mt-1 leading-snug">{card.hint}</p>
                            ) : null}
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-400 text-sm">
                        {t('common.loading')}
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-6 min-h-[480px]">
                        <aside
                            className={`w-full lg:w-80 shrink-0 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex-col max-h-[70vh] lg:max-h-none ${
                                showList || !showDetail ? 'flex' : 'hidden lg:flex'
                            } ${showDetail ? 'lg:flex' : ''}`}
                        >
                            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 space-y-2">
                                <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <Users size={18} className="text-slate-600" />
                                    {t('orders2.customersListTitle')}
                                </span>
                                <input
                                    type="search"
                                    value={customerSearch}
                                    onChange={(e) => setCustomerSearch(e.target.value)}
                                    placeholder={t('common.search')}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                                />
                            </div>
                            <div className="overflow-y-auto flex-1 p-2">
                                {visibleCustomers.length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-10 px-3">
                                        {t('orders2.noCustomersYet')}
                                    </p>
                                ) : (
                                    <ul className="space-y-1">
                                        {visibleCustomers.map((c) => {
                                            const st = customerStats.get(String(c.id)) || {
                                                activeCount: 0,
                                                totalSum: 0,
                                            }
                                            const active = String(selectedId) === String(c.id)
                                            return (
                                                <li key={c.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedId(c.id)
                                                            setDetailTab('active')
                                                        }}
                                                        className={`w-full text-left rounded-xl px-3 py-3 transition-colors border ${
                                                            active
                                                                ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                                                : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-900'
                                                        }`}
                                                    >
                                                        <div className="font-semibold text-sm leading-snug">
                                                            {c.name || '—'}
                                                        </div>
                                                        {c.phone ? (
                                                            <div
                                                                className={`text-xs mt-0.5 ${
                                                                    active ? 'text-slate-300' : 'text-gray-500'
                                                                }`}
                                                            >
                                                                {c.phone}
                                                            </div>
                                                        ) : null}
                                                        <div className="flex items-center justify-between mt-2 gap-2">
                                                            <span
                                                                className={`text-xs font-semibold tabular-nums ${
                                                                    active ? 'text-emerald-300' : 'text-emerald-700'
                                                                }`}
                                                            >
                                                                ${formatUsd(st.totalSum)}
                                                            </span>
                                                            {st.activeCount > 0 ? (
                                                                <span
                                                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                                                        active
                                                                            ? 'bg-white/15 text-white'
                                                                            : 'bg-amber-50 text-amber-800'
                                                                    }`}
                                                                >
                                                                    {st.activeCount} {t('orders2.activeShort')}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>
                        </aside>

                        <main
                            className={`flex-1 rounded-2xl border border-gray-100 bg-white shadow-sm min-h-[320px] ${
                                showDetail ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
                            }`}
                        >
                            {!selectedCustomer ? (
                                <div className="flex-1 flex items-center justify-center p-8 text-center text-gray-400 text-sm">
                                    {t('orders2.selectHint')}
                                </div>
                            ) : (
                                <>
                                    <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div className="flex items-start gap-2 min-w-0">
                                            <button
                                                type="button"
                                                className="lg:hidden mt-0.5 p-1.5 rounded-lg border border-gray-200 text-gray-600"
                                                onClick={() => setSelectedId(null)}
                                                aria-label={t('orders2.back')}
                                            >
                                                <ArrowLeft size={18} />
                                            </button>
                                            <div className="min-w-0">
                                                <h2 className="text-lg font-bold text-slate-900 truncate">
                                                    {selectedCustomer.name}
                                                </h2>
                                                <p className="text-sm text-gray-500">
                                                    {selectedCustomer.phone || '—'}
                                                    <span className="mx-2 text-gray-300">·</span>
                                                    <span className="font-semibold text-emerald-700 tabular-nums">
                                                        ${formatUsd(selectedCustomerTotal)}
                                                    </span>
                                                    <span className="ml-1 text-[11px] text-gray-400 font-normal">
                                                        ({t('orders2.totalShippedCompletedShort')})
                                                    </span>
                                                    {selectedCustomerOrderTotal >
                                                    selectedCustomerTotal + 0.009 ? (
                                                        <span className="ml-2 text-[11px] text-gray-400 tabular-nums">
                                                            · {t('orders2.orderTotalShort')} $
                                                            {formatUsd(selectedCustomerOrderTotal)}
                                                        </span>
                                                    ) : null}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={openNewOrder}
                                            disabled={schemaMissing}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40"
                                        >
                                            <ShoppingCart size={16} />
                                            {t('orders2.addOrder')}
                                        </button>
                                    </div>

                                    <div className="px-4 sm:px-5 pt-3 flex gap-2 border-b border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => setDetailTab('active')}
                                            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
                                                detailTab === 'active'
                                                    ? 'border-slate-900 text-slate-900'
                                                    : 'border-transparent text-gray-500'
                                            }`}
                                        >
                                            {t('orders2.tabActive')} ({selectedActiveOrders.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDetailTab('completed')}
                                            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
                                                detailTab === 'completed'
                                                    ? 'border-slate-900 text-slate-900'
                                                    : 'border-transparent text-gray-500'
                                            }`}
                                        >
                                            {t('orders2.tabCompleted')} ({selectedCompletedOrders.length})
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                                        {detailOrders.length === 0 ? (
                                            <p className="text-sm text-gray-400 text-center py-12">
                                                {detailTab === 'completed'
                                                    ? t('orders2.noCompletedOrders')
                                                    : t('orders2.noActiveOrders')}
                                            </p>
                                        ) : (
                                            <ul className="space-y-1.5">
                                                {detailOrders.map((o) => {
                                                    const items = Array.isArray(o.order_items)
                                                        ? o.order_items
                                                        : []
                                                    const clientName = orderClientName(o)
                                                    const noteRaw = orderNoteText(o)
                                                    // Mijoz ismi eslatmaga yozilgan bo‘lsa — eslatmada takrorlamaymiz
                                                    const note =
                                                        noteRaw &&
                                                        clientName &&
                                                        noteRaw.toLowerCase() === clientName.toLowerCase()
                                                            ? ''
                                                            : noteRaw
                                                    const cats = categoriesForOrder(o, products, language)
                                                    const printCat =
                                                        printCategoryByOrder[String(o.id)] || 'all'
                                                    const expanded = expandedOrderIds.has(String(o.id))
                                                    const ff = o.fulfillment
                                                    const shipHint =
                                                        ff &&
                                                        ff.ordered > 0 &&
                                                        ff.shipped > 0 &&
                                                        ff.shipped < ff.ordered
                                                            ? `${ff.shipped}/${ff.ordered}`
                                                            : null
                                                    return (
                                                        <li
                                                            key={o.id}
                                                            className="rounded-lg border border-gray-100 bg-white px-2.5 py-2 shadow-sm"
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="text-sm font-bold text-slate-900 truncate">
                                                                            #{o.order_number || o.id}
                                                                        </span>
                                                                        <span
                                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusBadgeClass(
                                                                                o.status
                                                                            )}`}
                                                                        >
                                                                            {statusLabel(o.status, t)}
                                                                        </span>
                                                                        {shipHint ? (
                                                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                                                                                {t('orders2.partialBadge')}{' '}
                                                                                {shipHint}
                                                                            </span>
                                                                        ) : null}
                                                                        <span className="text-[11px] text-gray-400">
                                                                            {formatOrderDate(
                                                                                o.created_at,
                                                                                language
                                                                            )}
                                                                        </span>
                                                                        {items.length > 0 ? (
                                                                            <span className="text-[10px] text-gray-400">
                                                                                · {items.length}{' '}
                                                                                {t('orders2.itemsCount')}
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                    {clientName ? (
                                                                        <p className="mt-0.5 text-sm font-semibold text-slate-800 truncate">
                                                                            {clientName}
                                                                        </p>
                                                                    ) : null}
                                                                    {note ? (
                                                                        <p className="mt-0.5 text-[11px] text-amber-800/90 bg-amber-50/80 rounded px-1.5 py-0.5 line-clamp-2">
                                                                            <span className="font-semibold">
                                                                                {t('orders2.noteLabel')}:
                                                                            </span>{' '}
                                                                            {note}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <p className="text-base font-bold text-emerald-700 tabular-nums">
                                                                        ${formatUsd(o.total)}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {expanded && items.length > 0 ? (
                                                                <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                                                                    {items.map((it) => (
                                                                        <li
                                                                            key={
                                                                                it.id ||
                                                                                `${it.product_id}-${it.line_index}`
                                                                            }
                                                                            className="text-xs text-gray-600 flex justify-between gap-2 leading-snug"
                                                                        >
                                                                            <span className="truncate">
                                                                                {it.product_name || '—'}
                                                                                {it.color
                                                                                    ? ` · ${it.color}`
                                                                                    : ''}
                                                                            </span>
                                                                            <span className="shrink-0 tabular-nums text-gray-500">
                                                                                {it.quantity}× $
                                                                                {formatUsd(it.price)}
                                                                            </span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : null}

                                                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                                                {['new', 'pending', 'completed'].map(
                                                                    (st) => (
                                                                        <button
                                                                            key={st}
                                                                            type="button"
                                                                            disabled={
                                                                                statusBusyId === o.id ||
                                                                                normalizeStatusForSelect(
                                                                                    o.status
                                                                                ) === st
                                                                            }
                                                                            onClick={() =>
                                                                                void handleStatusChange(
                                                                                    o,
                                                                                    st
                                                                                )
                                                                            }
                                                                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-white disabled:opacity-40"
                                                                        >
                                                                            {statusLabel(st, t)}
                                                                        </button>
                                                                    )
                                                                )}
                                                                <span className="w-px h-5 bg-gray-200 mx-0.5 hidden sm:block" />
                                                                <select
                                                                    value={printCat}
                                                                    onChange={(e) =>
                                                                        setPrintCategoryByOrder(
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                [String(o.id)]:
                                                                                    e.target.value,
                                                                            })
                                                                        )
                                                                    }
                                                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 max-w-[140px] bg-white"
                                                                    title={t('orders2.printCategory')}
                                                                >
                                                                    <option value="all">
                                                                        {t('orders2.printAllCategories')}
                                                                    </option>
                                                                    {cats.map((c) => (
                                                                        <option key={c} value={c}>
                                                                            {c}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void handlePrintOrder(o, true)
                                                                    }
                                                                    title={t('orders2.printWithPrice')}
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-slate-700"
                                                                >
                                                                    <Receipt size={15} />$
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void handlePrintOrder(o, false)
                                                                    }
                                                                    title={t('orders2.printWithoutPrice')}
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-slate-700"
                                                                >
                                                                    <Printer size={15} />
                                                                </button>
                                                                {canPartialShip(o) ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setPartialShipOrder(o)
                                                                        }
                                                                        title={t('orders2.partialShip')}
                                                                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"
                                                                    >
                                                                        <PackageCheck size={15} />
                                                                        {t('orders2.partialShipShort')}
                                                                    </button>
                                                                ) : null}
                                                                {ff?.shipped > 0 ? (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void handlePrintShippedPortion(
                                                                                    o,
                                                                                    true
                                                                                )
                                                                            }
                                                                            title={t('orders2.printShippedWithPrice')}
                                                                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-slate-600 hover:bg-gray-50"
                                                                        >
                                                                            <Receipt size={15} />
                                                                            {t('orders2.printShippedShort')}$
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void handlePrintShippedPortion(
                                                                                    o,
                                                                                    false
                                                                                )
                                                                            }
                                                                            title={t('orders2.printShippedWithoutPrice')}
                                                                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-slate-600 hover:bg-gray-50"
                                                                        >
                                                                            <Printer size={15} />
                                                                            {t('orders2.printShippedShort')}
                                                                        </button>
                                                                    </>
                                                                ) : null}
                                                                {items.length > 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            toggleExpandOrder(o.id)
                                                                        }
                                                                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                                    >
                                                                        {expanded ? (
                                                                            <EyeOff size={15} />
                                                                        ) : (
                                                                            <Eye size={15} />
                                                                        )}
                                                                        {expanded
                                                                            ? t('orders2.hideOrder')
                                                                            : t('orders2.viewOrder')}
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void openEditOrder(o)}
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-slate-600 hover:bg-gray-50 sm:ml-auto"
                                                                >
                                                                    <Pencil size={15} />
                                                                    {t('common.edit')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleDeleteOrder(o)}
                                                                    title={t('orders.moveToTrashTitle')}
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
                                                                >
                                                                    <Trash2 size={15} />
                                                                    {t('common.delete')}
                                                                </button>
                                                            </div>
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                </>
                            )}
                        </main>
                    </div>
                )}
            </div>

            {customerModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                    <form
                        onSubmit={saveCustomer}
                        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 p-5 space-y-4"
                    >
                        <h3 className="text-lg font-bold text-slate-900">{t('orders2.addCustomer')}</h3>
                        <label className="block text-sm">
                            <span className="font-semibold text-gray-700">{t('orders2.customerName')}</span>
                            <input
                                required
                                value={customerForm.name}
                                onChange={(e) =>
                                    setCustomerForm((f) => ({ ...f, name: e.target.value }))
                                }
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-gray-700">
                                {t('orders2.customerPhone')}{' '}
                                <span className="font-normal text-gray-400">
                                    ({t('common.optional')})
                                </span>
                            </span>
                            <input
                                value={customerForm.phone}
                                onChange={(e) =>
                                    setCustomerForm((f) => ({ ...f, phone: e.target.value }))
                                }
                                placeholder={t('orders2.customerPhonePlaceholder')}
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-gray-700">{t('orders2.customerNote')}</span>
                            <textarea
                                value={customerForm.notes}
                                onChange={(e) =>
                                    setCustomerForm((f) => ({ ...f, notes: e.target.value }))
                                }
                                rows={2}
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                            />
                        </label>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setCustomerModal(false)}
                                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={savingCustomer}
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}

            {isAdding && formSession ? (
                <OrderFormPanel
                    key={formSession.key}
                    editId={formSession.editId}
                    initialForm={formSession.initialForm}
                    initialOrderLines={formSession.initialOrderLines}
                    mergeSourceAgg={null}
                    mergeSourceOrderIds={null}
                    mergeArchiveSources={false}
                    products={products}
                    customers={customers}
                    productColors={productColors}
                    orders={orders}
                    tableConfig={tableConfig}
                    setTableConfig={setTableConfig}
                    onClose={closeOrderForm}
                    onSaved={handleFormSaved}
                    onMergeArchived={undefined}
                    loadTrashOrders={undefined}
                    saveOrderFn={saveBuyurtma2Order}
                    forceWorkspace={WORKSPACE}
                />
            ) : null}

            {partialShipOrder ? (
                <PartialShipModal
                    order={partialShipOrder}
                    products={products}
                    onClose={() => setPartialShipOrder(null)}
                    onPrintShipped={handlePrintShippedPortion}
                    onSuccess={async (info) => {
                        const orderId = info?.orderId
                        if (!orderId) {
                            await loadAll()
                            return
                        }
                        try {
                            const shippedMap = await loadOrderShippedMap(orderId)
                            setOrders((prev) =>
                                prev.map((o) => {
                                    if (String(o.id) !== String(orderId)) return o
                                    const fulfillment = computeOrderFulfillment(o, products, shippedMap)
                                    const next = { ...o, fulfillment }
                                    if (info?.status) next.status = info.status
                                    return next
                                })
                            )
                            if (info?.status && normalizeStatusForSelect(info.status) === 'completed') {
                                setDetailTab('completed')
                            }
                        } catch (e) {
                            console.error(e)
                            await loadAll()
                        }
                    }}
                />
            ) : null}
        </div>
    )
}
