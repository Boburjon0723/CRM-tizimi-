'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import {
    X,
    Send,
    Bot,
    User,
    Loader2,
    Sparkles,
    Minus,
    Maximize2,
    Minimize2,
} from 'lucide-react'

/* ─── AI javobini chiroyli render qilish ─── */
function AiMessageContent({ text }) {
    const blocks = useMemo(() => parseAiBlocks(text), [text])
    return (
        <div className="space-y-2 text-sm leading-relaxed text-gray-800">
            {blocks.map((b, i) => {
                if (b.type === 'table') return <AiTable key={i} rows={b.rows} />
                if (b.type === 'section') return <AiSection key={i} title={b.title} />
                if (b.type === 'listItem') return <AiListItem key={i} text={b.text} />
                if (b.type === 'keyValue') return <AiKeyValue key={i} label={b.label} value={b.value} />
                return (
                    <p key={i} className="whitespace-pre-wrap">
                        {b.text}
                    </p>
                )
            })}
        </div>
    )
}

function AiSection({ title }) {
    return (
        <div className="flex items-center gap-2 pt-2 pb-1">
            <div className="h-px flex-1 bg-gradient-to-r from-orange-200 to-transparent" />
            <span className="text-[11px] font-black uppercase tracking-widest text-orange-700 shrink-0">
                {title}
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-orange-200 to-transparent" />
        </div>
    )
}

function AiListItem({ text }) {
    const match = text.match(/^[-–•]\s*(.+?)\s*[:：]\s*(.+)$/)
    if (match) return <AiKeyValue label={match[1]} value={match[2]} />
    return (
        <div className="flex gap-2 items-start pl-1">
            <span className="text-orange-400 mt-0.5 shrink-0">•</span>
            <span className="whitespace-pre-wrap">{text.replace(/^[-–•]\s*/, '')}</span>
        </div>
    )
}

function AiKeyValue({ label, value }) {
    const isDebt = /qarz|biz qarz|ular qarz/i.test(value || '')
    const isMoney = /\$[\d,.]+|[\d,.]+ UZS/i.test(value || '')
    return (
        <div className="flex justify-between items-baseline gap-2 py-0.5 px-2 rounded-lg bg-gray-50/80 hover:bg-gray-100/80 transition-colors">
            <span className="text-gray-600 text-xs font-medium truncate">{label}</span>
            <span
                className={`text-xs font-bold tabular-nums whitespace-nowrap ${
                    isDebt ? 'text-red-600' : isMoney ? 'text-emerald-700' : 'text-gray-900'
                }`}
            >
                {value}
            </span>
        </div>
    )
}

function AiTable({ rows }) {
    if (!rows.length) return null
    const headers = rows[0]
    const body = rows.slice(1)
    return (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm my-1 max-w-full">
            <table className="w-full min-w-[520px] text-[11px] sm:text-xs">
                <thead>
                    <tr className="bg-gradient-to-r from-orange-50 to-amber-50">
                        {headers.map((h, i) => (
                            <th
                                key={i}
                                className="px-2 py-1.5 text-left font-bold text-orange-800 uppercase tracking-wide whitespace-nowrap"
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {body.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                            {row.map((cell, ci) => (
                                <td
                                    key={ci}
                                    className={`px-2 py-1.5 align-top break-words whitespace-pre-wrap ${
                                        ci === 0 ? 'font-semibold text-slate-800 whitespace-nowrap' : ''
                                    }`}
                                >
                                    {String(cell)
                                        .split(/<br\s*\/?>/gi)
                                        .map((part, idx) => (
                                            <div key={idx}>{part.trim()}</div>
                                        ))}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function parseAiBlocks(text) {
    if (!text) return [{ type: 'text', text: '' }]
    const lines = text.split('\n')
    const blocks = []
    let tableRows = []

    const flushTable = () => {
        if (tableRows.length > 0) {
            blocks.push({ type: 'table', rows: [...tableRows] })
            tableRows = []
        }
    }

    for (const raw of lines) {
        const line = raw.trimEnd()

        if (/^\|(.+)\|$/.test(line)) {
            const cells = line
                .split('|')
                .slice(1, -1)
                .map((c) => c.trim())
            if (cells.every((c) => /^[-:]+$/.test(c))) continue
            tableRows.push(cells)
            continue
        }
        flushTable()

        const sectionMatch =
            line.match(/^={2,}\s*(.+?)\s*={2,}$/) ||
            line.match(/^#{1,4}\s+(.+)$/) ||
            line.match(/^\*\*(.+?)\*\*\s*$/)
        if (sectionMatch && sectionMatch[1].length < 60) {
            blocks.push({ type: 'section', title: sectionMatch[1].replace(/\*\*/g, '') })
            continue
        }

        if (/^[-–•]\s+/.test(line)) {
            blocks.push({ type: 'listItem', text: line })
            continue
        }

        if (/^\d+[.)]\s+/.test(line)) {
            blocks.push({ type: 'listItem', text: line.replace(/^\d+[.)]\s+/, '') })
            continue
        }

        const kvMatch = line.match(/^(.{2,40}?)\s*[:：]\s+(.+)$/)
        if (kvMatch && !/^http/i.test(kvMatch[2])) {
            blocks.push({ type: 'keyValue', label: kvMatch[1], value: kvMatch[2] })
            continue
        }

        if (!line.trim()) continue
        blocks.push({ type: 'text', text: line })
    }
    flushTable()
    return blocks.length ? blocks : [{ type: 'text', text }]
}

const WELCOME =
    "Salom! Men Nuur Home CRM yordamchisiman. Buyurtmalar, Hamkorlar moliyasi va Bo'limlar xarajatlarini ko'raman. Savol bering!"

function ChatPanel({
    variant = 'float',
    messages,
    setMessages,
    input,
    setInput,
    loading,
    providerLabel,
    onSend,
    isMinimized,
    setIsMinimized,
    isWide,
    setIsWide,
    onClose,
}) {
    const scrollRef = useRef(null)
    const isPage = variant === 'page'

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, loading])

    const bubbleMax = isPage
        ? 'max-w-[min(100%,920px)]'
        : isWide
          ? 'max-w-[96%]'
          : 'max-w-[95%]'

    return (
        <div
            className={
                isPage
                    ? 'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-xl'
                    : `fixed bottom-6 right-6 z-[9999] flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] transition-all duration-300 ${
                          isMinimized
                              ? 'h-16 w-[380px] sm:w-[420px]'
                              : isWide
                                ? 'h-[85vh] w-[90vw] max-w-[900px]'
                                : 'h-[600px] max-h-[80vh] w-[380px] sm:w-[420px]'
                      }`
            }
        >
            <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-3 text-white sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                        <Bot className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold leading-tight">Nuur AI Agent</h3>
                        <p className="truncate text-[10px] font-bold uppercase tracking-wider opacity-90">
                            {providerLabel}
                        </p>
                    </div>
                </div>
                {!isPage ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => setIsWide(!isWide)}
                            className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                            title={isWide ? 'Kichik oyna' : 'Keng oyna'}
                        >
                            {isWide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsMinimized(!isMinimized)}
                            className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <p className="hidden text-[11px] font-medium text-white/90 sm:block">
                        To‘liq ekran · jadvallar kengroq
                    </p>
                )}
            </div>

            {(isPage || !isMinimized) && (
                <>
                    <div
                        ref={scrollRef}
                        className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-gray-50/80 to-white/50 p-3 sm:p-5"
                    >
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`flex gap-2.5 ${
                                        msg.role === 'user'
                                            ? `flex-row-reverse ${isPage ? 'max-w-[70%]' : bubbleMax}`
                                            : bubbleMax
                                    }`}
                                >
                                    <div
                                        className={`mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                                            msg.role === 'ai'
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-blue-100 text-blue-600'
                                        }`}
                                    >
                                        {msg.role === 'ai' ? (
                                            <Bot className="h-4 w-4" />
                                        ) : (
                                            <User className="h-4 w-4" />
                                        )}
                                    </div>
                                    <div
                                        className={`rounded-2xl p-3 ${
                                            msg.role === 'ai'
                                                ? 'rounded-tl-none border border-gray-100 bg-white shadow-sm'
                                                : 'whitespace-pre-wrap rounded-tr-none bg-blue-600 text-sm text-white'
                                        }`}
                                    >
                                        {msg.role === 'ai' ? (
                                            <AiMessageContent text={msg.content} />
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex max-w-[85%] gap-2.5">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                                        <Bot className="h-4 w-4" />
                                    </div>
                                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-gray-100 bg-white p-3 shadow-sm">
                                        <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                                        <span className="text-xs font-medium text-gray-400">O&apos;ylanmoqda…</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <form
                        onSubmit={onSend}
                        className="flex-shrink-0 border-t border-gray-100 bg-white p-3 sm:p-4"
                    >
                        <div className="relative mx-auto max-w-4xl">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Masalan: Galim aka buyurtmasi? yoki iyul xarajatlari?"
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-4 pr-12 text-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || loading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-orange-600 p-2 text-white transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="mt-2 text-center text-[10px] text-gray-400">
                            AI buyurtma, hamkor moliyasi va bo&apos;lim xarajatlarini ko&apos;radi.
                        </p>
                    </form>
                </>
            )}
        </div>
    )
}

export default function AIAgent({ variant = 'float' }) {
    const pathname = usePathname()
    const isPage = variant === 'page'
    const [isOpen, setIsOpen] = useState(isPage)
    const [isMinimized, setIsMinimized] = useState(false)
    const [isWide, setIsWide] = useState(false)
    const [messages, setMessages] = useState([{ role: 'ai', content: WELCOME }])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [providerLabel, setProviderLabel] = useState('Groq')

    // To‘liq sahifa ochiq bo‘lsa — pastki o‘ngdagi floating chat kerak emas
    if (!isPage && (pathname === '/ai' || pathname?.startsWith('/ai/') || pathname?.startsWith('/login'))) {
        return null
    }

    const handleSendMessage = async (e) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        const userMessage = { role: 'user', content: input }
        const newMessages = [...messages, userMessage]
        setMessages(newMessages)
        setInput('')
        setLoading(true)

        try {
            const res = await fetch('/api/crm-ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: newMessages }),
            })

            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) {
                throw new Error(data.message || data.error || 'Xatolik')
            }

            if (data.via === 'groq') setProviderLabel(data.model ? `Groq · ${data.model}` : 'Groq')
            else if (data.via === 'openrouter') setProviderLabel('OpenRouter')
            else if (data.via === 'gemini' || data.via === 'gemini_fallback') setProviderLabel('Gemini')

            setMessages((prev) => [...prev, { role: 'ai', content: data.text }])
        } catch (error) {
            console.error('AI Error:', error)
            setMessages((prev) => [
                ...prev,
                {
                    role: 'ai',
                    content:
                        error?.message ||
                        "Kechirasiz, AI javob bermadi. GROQ_API_KEY ni .env.local ga qo'shing yoki keyinroq urinib ko'ring.",
                },
            ])
        } finally {
            setLoading(false)
        }
    }

    if (isPage) {
        return (
            <ChatPanel
                variant="page"
                messages={messages}
                setMessages={setMessages}
                input={input}
                setInput={setInput}
                loading={loading}
                providerLabel={providerLabel}
                onSend={handleSendMessage}
            />
        )
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="group fixed bottom-6 right-6 z-[9999] flex items-center gap-2 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 p-4 text-white shadow-2xl transition-all hover:scale-110 hover:shadow-orange-200/50"
                type="button"
                aria-label="AI yordamchi"
            >
                <div className="absolute -top-12 right-0 whitespace-nowrap rounded-xl border border-gray-100 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    Savolingiz bormi?
                </div>
                <Sparkles className="h-6 w-6" />
            </button>
        )
    }

    return (
        <ChatPanel
            variant="float"
            messages={messages}
            setMessages={setMessages}
            input={input}
            setInput={setInput}
            loading={loading}
            providerLabel={providerLabel}
            onSend={handleSendMessage}
            isMinimized={isMinimized}
            setIsMinimized={setIsMinimized}
            isWide={isWide}
            setIsWide={setIsWide}
            onClose={() => setIsOpen(false)}
        />
    )
}
