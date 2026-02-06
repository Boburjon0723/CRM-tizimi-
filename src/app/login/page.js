'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Lock, Mail } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) throw error

            router.push('/')
            router.refresh()
        } catch (error) {
            alert('Kirishda xatolik: ' + error.message)
        } finally {
            setLoading(false)
        }
    }


    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-900 px-4">
            <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/20">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 mb-4 shadow-xl backdrop-blur-md border border-white/10 transition-transform hover:scale-105 duration-300">
                        <img src="/favicon.svg" alt="Logo" className="w-12 h-12 object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">CRM Boshqaruv</h1>
                    <p className="text-blue-200 text-sm">Tizimga kirish uchun ma'lumotlaringizni kiriting</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-blue-100 mb-2">Email manzil</label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-blue-400/30 rounded-xl text-white placeholder-blue-300/50 focus:ring-2 focus:ring-blue-400 focus:border-transparent focus:bg-white/10 outline-none transition-all"
                                placeholder="admin@example.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-blue-100 mb-2">Parol</label>
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-blue-400/30 rounded-xl text-white placeholder-blue-300/50 focus:ring-2 focus:ring-blue-400 focus:border-transparent focus:bg-white/10 outline-none transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all flex justify-center items-center disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                            'Tizimga Kirish'
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-blue-200/60 text-xs">
                        &copy; {new Date().getFullYear()} CRM Tizimi. Barcha huquqlar himoyalangan.
                    </p>
                </div>
            </div>
        </div>
    )
}
