'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const NotificationContext = createContext()

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        // Subscribe to new orders from website
        const channel = supabase
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

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

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
