'use client'

import { useEffect } from 'react'

const CHUNK_RECOVERY_KEY = '__chunk_error_recovery_ran__'

function extractMessage(value) {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (typeof value?.message === 'string') return value.message
    return String(value)
}

function isChunkLoadMessage(message) {
    const normalized = message.toLowerCase()
    return (
        normalized.includes('chunkloaderror') ||
        normalized.includes('loading chunk') ||
        normalized.includes('css chunk load failed')
    )
}

export default function ChunkErrorRecovery() {
    useEffect(() => {
        if (typeof window === 'undefined') return

        const tryRecover = (message) => {
            if (!isChunkLoadMessage(message)) return

            const alreadyRecovered = sessionStorage.getItem(CHUNK_RECOVERY_KEY) === '1'
            if (alreadyRecovered) return

            sessionStorage.setItem(CHUNK_RECOVERY_KEY, '1')
            window.location.reload()
        }

        const onError = (event) => {
            const message = extractMessage(event?.message || event?.error)
            tryRecover(message)
        }

        const onUnhandledRejection = (event) => {
            const message = extractMessage(event?.reason)
            tryRecover(message)
        }

        window.addEventListener('error', onError)
        window.addEventListener('unhandledrejection', onUnhandledRejection)

        // If page loads fine after recovery, allow one future retry.
        const resetTimer = window.setTimeout(() => {
            sessionStorage.removeItem(CHUNK_RECOVERY_KEY)
        }, 8000)

        return () => {
            window.clearTimeout(resetTimer)
            window.removeEventListener('error', onError)
            window.removeEventListener('unhandledrejection', onUnhandledRejection)
        }
    }, [])

    return null
}
