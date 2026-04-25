'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

const NotificationContext = createContext()

export function NotificationProvider({ children }) {
    const { t, language } = useLanguage()
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        // Subscribe to new orders from website
        const orderChannel = supabase
            .channel('order_notifications')
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders',
                    filter: 'source=eq.website'
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
                        timestamp: new Date()
                    }

                    setNotifications(prev => [notification, ...prev])
                    setUnreadCount(prev => prev + 1)
                    playNotificationSound()
                }
            )
            .subscribe()

        // Subscribe to new contact messages
        const messageChannel = supabase
            .channel('message_notifications')
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'contact_messages'
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
                        timestamp: new Date()
                    }

                    setNotifications(prev => [notification, ...prev])
                    setUnreadCount(prev => prev + 1)
                    playNotificationSound()
                }
            )
            .subscribe()

        /** Telegram bot: material_movements (note ichida [telegram]) */
        const botMovementChannel = supabase
            .channel('bot_material_movements')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'material_movements' },
                (payload) => {
                    const row = payload.new
                    if (!row || !String(row.note || '').includes('[telegram]')) return
                    const cost = Number(row.total_cost)
                    const msg = [
                        Number.isFinite(cost) ? `${cost.toLocaleString()} so'm` : '',
                        row.movement_date || '',
                    ]
                        .filter(Boolean)
                        .join(' · ')
                    setNotifications((prev) => [
                        {
                            id: `mm-${row.id}`,
                            type: 'bot_finance',
                            title: t('common.notifyBotMaterialTitle'),
                            message: msg || t('common.notifyBotMaterialFallback'),
                            data: row,
                            read: false,
                            timestamp: new Date(),
                        },
                        ...prev,
                    ])
                    setUnreadCount((c) => c + 1)
                    playNotificationSound()
                }
            )
            .subscribe()

        /** Telegram bot: xodim avansi */
        const botAdvanceChannel = supabase
            .channel('bot_employee_advances')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'employee_advances' },
                (payload) => {
                    const row = payload.new
                    if (!row || row.source !== 'telegram') return
                    const amt = Number(row.amount)
                    const msg = Number.isFinite(amt) ? `${amt.toLocaleString()} so'm` : ''
                    setNotifications((prev) => [
                        {
                            id: `ea-${row.id}`,
                            type: 'bot_advance',
                            title: t('common.notifyBotAdvanceTitle'),
                            message: msg,
                            data: row,
                            read: false,
                            timestamp: new Date(),
                        },
                        ...prev,
                    ])
                    setUnreadCount((c) => c + 1)
                    playNotificationSound()
                }
            )
            .subscribe()

        /** Telegram bot: oylik to‘lovi */
        const botSalaryChannel = supabase
            .channel('bot_employee_salary')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'employee_salary_payments' },
                (payload) => {
                    const row = payload.new
                    if (!row || row.source !== 'telegram') return
                    const amt = Number(row.amount)
                    const msg = Number.isFinite(amt) ? `${amt.toLocaleString()} so'm` : ''
                    setNotifications((prev) => [
                        {
                            id: `esp-${row.id}`,
                            type: 'bot_salary',
                            title: t('common.notifyBotSalaryTitle'),
                            message: msg,
                            data: row,
                            read: false,
                            timestamp: new Date(),
                        },
                        ...prev,
                    ])
                    setUnreadCount((c) => c + 1)
                    playNotificationSound()
                }
            )
            .subscribe()

        /** Telegram bot: dam olish so‘rovi */
        const botLeaveChannel = supabase
            .channel('bot_employee_leave_requests')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'employee_leave_requests' },
                (payload) => {
                    const row = payload.new
                    if (!row) return
                    const id = row.id
                    void (async () => {
                        let label = ''
                        if (row.employee_id) {
                            const { data: emp } = await supabase
                                .from('employees')
                                .select('name')
                                .eq('id', row.employee_id)
                                .maybeSingle()
                            label = emp?.name ? String(emp.name).trim() : ''
                        }
                        setNotifications((prev) => [
                            {
                                id: `elr-${id}`,
                                type: 'bot_leave_request',
                                title: t('common.notifyBotLeaveTitle'),
                                message: label || '—',
                                data: row,
                                read: false,
                                timestamp: new Date(),
                            },
                            ...prev,
                        ])
                        setUnreadCount((c) => c + 1)
                        playNotificationSound()
                    })()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(orderChannel)
            supabase.removeChannel(messageChannel)
            supabase.removeChannel(botMovementChannel)
            supabase.removeChannel(botAdvanceChannel)
            supabase.removeChannel(botSalaryChannel)
            supabase.removeChannel(botLeaveChannel)
        }
    }, [language, t])

    function playNotificationSound() {
        if (typeof window !== 'undefined') {
            try {
                const audio = new Audio('/notification.mp3')
                audio.volume = 0.5
                audio.play().catch(() => {
                    // Fallback beep sound using Web Audio API
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
        setNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, read: true } : n)
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
    }

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        setUnreadCount(0)
    }

    const clearNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
        const notification = notifications.find(n => n.id === id)
        if (notification && !notification.read) {
            setUnreadCount(prev => Math.max(0, prev - 1))
        }
    }

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            markAsRead,
            markAllAsRead,
            clearNotification
        }}>
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
