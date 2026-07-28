'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { STALE_ORDER_DAYS, filterStaleOpenOrders } from '@/lib/staleOrders'

const NotificationContext = createContext()

const STALE_UI_KEY = 'crm_stale_orders_ui_date'
const STALE_TG_KEY = 'crm_stale_orders_tg_date'

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        // Subscribe to new orders from website
        const orderChannel = supabase
            .channel('order_notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders',
                    filter: 'source=eq.website',
                },
                (payload) => {
                    const newOrder = payload.new
                    const notification = {
                        id: newOrder.id,
                        type: 'order',
                        title: 'Yangi buyurtma!',
                        message: `${newOrder.customer_name} - $${newOrder.total?.toLocaleString()}`,
                        data: newOrder,
                        read: false,
                        timestamp: new Date(),
                    }

                    setNotifications((prev) => [notification, ...prev])
                    setUnreadCount((prev) => prev + 1)
                    playNotificationSound()
                }
            )
            .subscribe()

        // Subscribe to new contact messages
        const messageChannel = supabase
            .channel('message_notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'contact_messages',
                },
                (payload) => {
                    const newMessage = payload.new
                    const notification = {
                        id: newMessage.id,
                        type: 'message',
                        title: 'Yangi xabar!',
                        message: `${newMessage.name} - ${newMessage.subject || newMessage.message.substring(0, 50)}...`,
                        data: newMessage,
                        read: false,
                        timestamp: new Date(),
                    }

                    setNotifications((prev) => [notification, ...prev])
                    setUnreadCount((prev) => prev + 1)
                    playNotificationSound()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(orderChannel)
            supabase.removeChannel(messageChannel)
        }
    }, [])

    /** 12+ kun ochiq (Yangi/Jarayonda) buyurtmalar — UI + kuniga 1 marta Telegram (AI orqali) */
    useEffect(() => {
        let cancelled = false

        async function checkStaleOrders() {
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession()
                if (!session?.access_token || cancelled) return

                const today = new Date().toISOString().slice(0, 10)
                let lastTg = null
                let lastUi = null
                try {
                    lastTg = localStorage.getItem(STALE_TG_KEY)
                    lastUi = localStorage.getItem(STALE_UI_KEY)
                } catch {
                    /* ignore */
                }

                const shouldTelegram = lastTg !== today
                const res = await fetch(
                    `/api/stale-orders/check?notify=${shouldTelegram ? '1' : '0'}`,
                    {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${session.access_token}`,
                        },
                    }
                )
                const data = await res.json().catch(() => null)
                if (cancelled || !data?.ok) {
                    // API ishlamasa — faqat lokal tekshiruv
                    await fallbackLocalStaleUi(today, lastUi)
                    return
                }

                if (shouldTelegram && (data.telegram?.ok || data.count === 0)) {
                    try {
                        localStorage.setItem(STALE_TG_KEY, today)
                    } catch {
                        /* ignore */
                    }
                }

                if (data.count > 0 && lastUi !== today) {
                    const title = `⚠️ ${data.count} ta eski buyurtma (${STALE_ORDER_DAYS}+ kun)`
                    const message =
                        (data.aiUsed && data.message
                            ? String(data.message).replace(/<[^>]+>/g, '').slice(0, 180)
                            : `${data.count} ta Yangi/Jarayonda buyurtma ${STALE_ORDER_DAYS} kundan oshgan`) +
                        (data.aiUsed ? ' · AI' : '')

                    setNotifications((prev) => [
                        {
                            id: `stale-${today}`,
                            type: 'stale_order',
                            title,
                            message,
                            data: { count: data.count, orders: data.orders },
                            read: false,
                            timestamp: new Date(),
                            href: '/buyurtmalar',
                        },
                        ...prev,
                    ])
                    setUnreadCount((prev) => prev + 1)
                    playNotificationSound()
                    try {
                        localStorage.setItem(STALE_UI_KEY, today)
                    } catch {
                        /* ignore */
                    }
                }
            } catch (e) {
                console.warn('stale orders check:', e)
            }
        }

        async function fallbackLocalStaleUi(today, lastUi) {
            if (lastUi === today) return
            const { data, error } = await supabase
                .from('orders')
                .select('id, order_number, customer_name, total, status, created_at')
                .limit(800)
            if (error || cancelled) return
            const stale = filterStaleOpenOrders(data || [])
            if (!stale.length) return
            setNotifications((prev) => [
                {
                    id: `stale-${today}`,
                    type: 'stale_order',
                    title: `⚠️ ${stale.length} ta eski buyurtma (${STALE_ORDER_DAYS}+ kun)`,
                    message: `Yangi yoki Jarayonda holatida ${STALE_ORDER_DAYS}+ kun turib qolgan.`,
                    data: { count: stale.length, orders: stale },
                    read: false,
                    timestamp: new Date(),
                    href: '/buyurtmalar',
                },
                ...prev,
            ])
            setUnreadCount((prev) => prev + 1)
            playNotificationSound()
            try {
                localStorage.setItem(STALE_UI_KEY, today)
            } catch {
                /* ignore */
            }
        }

        checkStaleOrders()
        return () => {
            cancelled = true
        }
    }, [])

    function playNotificationSound() {
        if (typeof window !== 'undefined') {
            try {
                const audio = new Audio('/notification.mp3')
                audio.volume = 0.5
                audio.play().catch(() => {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
                    const oscillator = audioContext.createOscillator()
                    const gainNode = audioContext.createGain()

                    oscillator.connect(gainNode)
                    gainNode.connect(audioContext.destination)

                    oscillator.frequency.value = 800
                    gainNode.gain.value = 0.3

                    oscillator.start()
                    setTimeout(() => oscillator.stop(), 200)
                })
            } catch (error) {
                console.log('Audio play failed:', error)
            }
        }
    }

    const markAsRead = (id) => {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
        setUnreadCount((prev) => Math.max(0, prev - 1))
    }

    const markAllAsRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnreadCount(0)
    }

    const clearNotification = (id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id))
        const notification = notifications.find((n) => n.id === id)
        if (notification && !notification.read) {
            setUnreadCount((prev) => Math.max(0, prev - 1))
        }
    }

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                unreadCount,
                markAsRead,
                markAllAsRead,
                clearNotification,
            }}
        >
            {children}
        </NotificationContext.Provider>
    )
}

export function useNotifications() {
    const context = useContext(NotificationContext)
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider')
    }
    return context
}
