'use client'

import { createContext, useContext, useState } from 'react'

const LayoutContext = createContext()

export function LayoutProvider({ children }) {
    const [sidebarOpen, setSidebarOpen] = useState(false)

    const toggleSidebar = () => setSidebarOpen(prev => !prev)
    const closeSidebar = () => setSidebarOpen(false)
    const openSidebar = () => setSidebarOpen(true)

    return (
        <LayoutContext.Provider value={{ sidebarOpen, toggleSidebar, closeSidebar, openSidebar, setSidebarOpen }}>
            {children}
        </LayoutContext.Provider>
    )
}

export function useLayout() {
    const context = useContext(LayoutContext)
    if (context === undefined) {
        throw new Error('useLayout must be used within a LayoutProvider')
    }
    return context
}
