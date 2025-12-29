import { Bell, Search, User, Menu } from 'lucide-react'
import { useLayout } from '@/context/LayoutContext'

export default function Header({ title, toggleSidebar: propToggleSidebar }) {
    const { toggleSidebar: contextToggleSidebar } = useLayout()
    const toggleSidebar = propToggleSidebar || contextToggleSidebar
    return (
        <header className="bg-white shadow-sm p-4 mb-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleSidebar}
                        className="lg:hidden p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                    >
                        <Menu size={24} />
                    </button>
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold text-gray-800">{title}</h2>
                        <p className="hidden md:block text-sm text-gray-500">
                            {new Date().toLocaleDateString('uz-UZ', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                    <button className="relative p-2 hover:bg-gray-100 rounded-full">
                        <Bell size={20} />
                        <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
                    </button>

                    <button className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg">
                        <User size={20} />
                        <span className="hidden sm:inline text-sm font-medium">Admin</span>
                    </button>
                </div>
            </div>
        </header>
    )
}