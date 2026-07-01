'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import {
    createEmptyOrderLine,
    computeOrderLinesSubtotal,
    buildOrderFormTableRows,
    displayProductName,
    normalizeColorsArray,
    seedColorQtyForMatrix,
    saveNewOrderDraft,
    clearNewOrderDraft,
    orderLinesHasDuplicateProduct,
    findFirstDuplicateProductLineId,
    mergeDuplicateSourceLineIntoTarget,
} from '../utils'
import { getProductsByModelCode } from '../lib/orderFormUtils'
import { saveOrder } from '../lib/saveOrder'

const OrderFormDialog = dynamic(() => import('./OrderFormDialog'), { ssr: false })

export default function OrderFormPanel({
    editId,
    initialForm,
    initialOrderLines,
    mergeSourceAgg,
    mergeSourceOrderIds,
    mergeArchiveSources = true,
    products,
    customers,
    productColors,
    orders,
    tableConfig,
    setTableConfig,
    onClose,
    onSaved,
    onMergeArchived,
    loadTrashOrders,
}) {
    const { t, language } = useLanguage()
    const { showAlert, showConfirm, showToast } = useDialog()

    const [form, setForm] = useState(initialForm)
    const [orderLines, setOrderLines] = useState(initialOrderLines)
    const [isSavingOrder, setIsSavingOrder] = useState(false)

    const orderFormPanelRef = useRef(null)
    const firstModelCodeRef = useRef(null)
    const formRef = useRef(form)
    const orderLinesRef = useRef(orderLines)
    const savingOrderRef = useRef(false)

    useEffect(() => {
        formRef.current = form
    }, [form])
    useEffect(() => {
        orderLinesRef.current = orderLines
    }, [orderLines])

    useEffect(() => {
        if (editId) return
        const tid = setTimeout(() => {
            saveNewOrderDraft(formRef.current, orderLinesRef.current)
        }, 600)
        return () => {
            clearTimeout(tid)
            if (!editId) {
                saveNewOrderDraft(formRef.current, orderLinesRef.current)
            }
        }
    }, [form, orderLines, editId])

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'hidden' && !editId) {
                saveNewOrderDraft(formRef.current, orderLinesRef.current)
            }
        }
        document.addEventListener('visibilitychange', onVis)
        return () => document.removeEventListener('visibilitychange', onVis)
    }, [editId])

    useEffect(() => {
        if (!editId) {
            const tid = setTimeout(() => firstModelCodeRef.current?.focus(), 100)
            return () => clearTimeout(tid)
        }
    }, [editId])

    useEffect(() => {
        const tid = setTimeout(() => {
            orderFormPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 80)
        return () => clearTimeout(tid)
    }, [editId])

    const productsById = useMemo(() => {
        const map = new Map()
        for (const p of products) {
            map.set(String(p.id), p)
        }
        return map
    }, [products])

    const orderLinesSubtotal = useMemo(() => computeOrderLinesSubtotal(orderLines), [orderLines])
    const grandTotal = mergeSourceAgg != null ? mergeSourceAgg.subtotal : orderLinesSubtotal

    const orderFormTableRows = useMemo(
        () =>
            buildOrderFormTableRows(
                orderLines,
                products,
                language,
                t('orders.categoryUncategorized'),
                productsById
            ),
        [orderLines, products, language, t, productsById]
    )

    const firstCodeLineId = useMemo(
        () =>
            orderFormTableRows.find((r) => r.type === 'line' && !r.line.product_id)?.line?.id ??
            orderFormTableRows.find((r) => r.type === 'line')?.line?.id,
        [orderFormTableRows]
    )

    const updateOrderLine = useCallback((lineId, patch) => {
        setOrderLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
    }, [])

    const updateOrderLineColorQty = useCallback((lineId, colorKey, value) => {
        setOrderLines((prev) =>
            prev.map((l) => {
                if (l.id !== lineId) return l
                return {
                    ...l,
                    colorQtyByColor: { ...(l.colorQtyByColor || {}), [colorKey]: value },
                    resolveError: '',
                }
            })
        )
    }, [])

    const addOrderLine = useCallback(() => {
        setOrderLines((prev) => [...prev, createEmptyOrderLine()])
    }, [])

    const removeOrderLine = useCallback((lineId) => {
        setOrderLines((prev) => {
            const next = prev.filter((l) => l.id !== lineId)
            return next.length ? next : [createEmptyOrderLine()]
        })
    }, [])

    const commitLineToSortOrder = useCallback((lineId) => {
        setOrderLines((prev) =>
            prev.map((l) => (l.id === lineId && l.product_id ? { ...l, readyForSort: true } : l))
        )
    }, [])

    const applyVariantToLine = useCallback(
        async (lineId, productIdStr) => {
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
                            readyForSort: false,
                            keepSeparate: false,
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
                    title: t('common.dialogConfirmTitle'),
                    confirmLabel: t('orders.duplicateMergeYes'),
                    cancelLabel: t('orders.duplicateMergeNo'),
                    variant: 'info',
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
                            readyForSort: false,
                            keepSeparate: false,
                        }
                        setOrderLines(mergeDuplicateSourceLineIntoTarget(snapshot, targetId, resolvedLine, p))
                        return
                    }
                } else {
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
                                readyForSort: false,
                                keepSeparate: true,
                            }
                        })
                    )
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
                        readyForSort: false,
                        keepSeparate: orderLinesHasDuplicateProduct(snapshot, productIdStr, lineId),
                    }
                })
            )
        },
        [products, showConfirm, t]
    )

    const resolveOrderLine = useCallback(
        async (lineId) => {
            const line = orderLinesRef.current.find((l) => l.id === lineId)
            if (!line) return

            const { list, reason } = getProductsByModelCode(products, line.codeInput)
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
                    readyForSort: false,
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
                        readyForSort: false,
                        keepSeparate: false,
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
                        readyForSort: false,
                        keepSeparate: false,
                    }
                }

                if (orderLinesHasDuplicateProduct(prevSnapshot, product.id, lineId)) {
                    const merge = await showConfirm(t('orders.duplicateProductMergePrompt'), {
                        title: t('common.dialogConfirmTitle'),
                        confirmLabel: t('orders.duplicateMergeYes'),
                        cancelLabel: t('orders.duplicateMergeNo'),
                        variant: 'info',
                    })
                    if (merge) {
                        const targetId = findFirstDuplicateProductLineId(prevSnapshot, product.id, lineId)
                        if (targetId) {
                            setOrderLines(
                                mergeDuplicateSourceLineIntoTarget(prevSnapshot, targetId, nextLine, product)
                            )
                            return
                        }
                    } else {
                        nextLine.keepSeparate = true
                    }
                }

                const lineForSet = orderLinesHasDuplicateProduct(prevSnapshot, product.id, lineId)
                    ? { ...nextLine, keepSeparate: true }
                    : nextLine
                setOrderLines((p) => p.map((l) => (l.id === lineId ? lineForSet : l)))
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
                readyForSort: false,
            }
            setOrderLines((p) => p.map((l) => (l.id === lineId ? nextLine : l)))
        },
        [products, showConfirm, t]
    )

    const handleCancel = useCallback(() => {
        clearNewOrderDraft()
        onClose()
    }, [onClose])

    const handleSubmit = useCallback(
        async (e) => {
            e.preventDefault()
            if (savingOrderRef.current) return
            savingOrderRef.current = true
            setIsSavingOrder(true)
            try {
                const result = await saveOrder({
                    form,
                    orderLines,
                    editId,
                    orders,
                    products,
                    customers,
                    mergeSourceAgg,
                    mergeSourceOrderIds,
                    mergeArchiveSources,
                    t,
                    showAlert,
                    showToast,
                    onMergeArchived,
                    loadTrashOrders,
                })
                if (result.ok) {
                    await onSaved?.()
                    onClose()
                }
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
        },
        [
            form,
            orderLines,
            editId,
            orders,
            products,
            customers,
            mergeSourceAgg,
            mergeSourceOrderIds,
            mergeArchiveSources,
            t,
            showAlert,
            showToast,
            onMergeArchived,
            loadTrashOrders,
            onSaved,
            onClose,
        ]
    )

    return (
        <OrderFormDialog
            t={t}
            isAdding
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
            productsById={productsById}
            grandTotal={grandTotal}
        />
    )
}
