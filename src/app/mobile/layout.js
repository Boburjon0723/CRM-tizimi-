'use client'

export default function MobileLayout({ children }) {
    return (
        <div className="relative min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans max-w-lg mx-auto sm:border-x sm:border-slate-800 shadow-2xl">
            {/* The main content area grows to fill available space, leaving room for the bottom nav */}
            <main className="flex-1 overflow-y-auto pb-20 no-scrollbar">
                {children}
            </main>
        </div>
    )
}
