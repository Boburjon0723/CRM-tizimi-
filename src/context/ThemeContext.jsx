'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        try {
            const saved = localStorage.getItem('crm_theme_dark')
            const nextDark = saved === '1'
            setIsDark(nextDark)
            document.documentElement.setAttribute('data-theme', nextDark ? 'dark' : 'light')
        } catch {
            document.documentElement.setAttribute('data-theme', 'light')
        }
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
        try {
            localStorage.setItem('crm_theme_dark', isDark ? '1' : '0')
        } catch {}
    }, [isDark])

    const toggleTheme = () => setIsDark((v) => !v)

    return <ThemeContext.Provider value={{ isDark, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')
    return context
}

