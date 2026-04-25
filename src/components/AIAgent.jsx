'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Bot, User, Loader2, Sparkles, Minus, Maximize2 } from 'lucide-react'

// Constants like API_KEY are now handled on the server via /api/crm-ai/chat
const MODEL_NAME = 'gemini-2.0-flash-lite' 

export default function AIAgent() {
    const [isOpen, setIsOpen] = useState(false)
    const [isMinimized, setIsMinimized] = useState(false)
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Salom! Men Nuur Home CRM yordamchisiman. Sizga qanday yordam bera olaman?' }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

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
                body: JSON.stringify({ messages: newMessages })
            })

            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Xatolik')

            setMessages(prev => [...prev, { role: 'ai', content: data.text }])
        } catch (error) {
            console.error('AI Error:', error)
            setMessages(prev => [...prev, { role: 'ai', content: 'Kechirasiz, xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.' }])
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all z-[9999] flex items-center gap-2 group"
            >
                <div className="absolute -top-12 right-0 bg-white text-gray-800 px-3 py-1.5 rounded-xl shadow-lg border border-gray-100 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Savolingiz bormi?
                </div>
                <Sparkles className="w-6 h-6" />
            </button>
        )
    }

    return (
        <div 
            className={`fixed bottom-6 right-6 w-[380px] sm:w-[420px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden z-[9999] transition-all duration-300 flex flex-col ${isMinimized ? 'h-16' : 'h-[600px] max-h-[80vh]'}`}
        >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
                        <Bot className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm leading-tight">Nuur AI Agent</h3>
                        <p className="text-[10px] opacity-80 uppercase tracking-wider font-bold">Gemini 2.0 Flash Lite</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    </button>
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Chat Body */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === 'ai' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'}`}>
                                        {msg.role === 'ai' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                                    </div>
                                    <div className={`p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'ai' ? 'bg-white shadow-sm border border-gray-100 text-gray-800 rounded-tl-none' : 'bg-blue-600 text-white rounded-tr-none'}`}>
                                        {msg.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex gap-3 max-w-[85%]">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                        <Bot className="w-5 h-5" />
                                    </div>
                                    <div className="p-3 bg-white shadow-sm border border-gray-100 rounded-2xl rounded-tl-none flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                        <span className="text-xs text-gray-400 font-medium">Fikrlanmoqda...</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Field */}
                    <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
                        <div className="relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Savolingizni yozing..."
                                className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || loading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="mt-2 text-[10px] text-center text-gray-400">
                            AI agent xato qilishi mumkin. Muhim ma'lumotlarni tekshirib ko'ring.
                        </p>
                    </form>
                </>
            )}
        </div>
    )
}
