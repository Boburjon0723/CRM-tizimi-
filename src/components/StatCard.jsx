export default function StatCard({ icon: Icon, title, value, color, trend }) {
    // Extract base color name from tailwind class if possible, or default to blue
    // For simplicity, we'll use inline styles or specific mappings if needed.
    // Assuming 'color' prop comes like 'bg-blue-500' or similar.

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-300">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${color.replace('bg-', 'bg-opacity-10 text-').replace('500', '600')} ${color.includes('gradient') ? 'text-white' : ''} ${color}`}>
                    <Icon size={24} />
                </div>
                {trend && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                )}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-gray-800 tracking-tight">{value}</h3>
            </div>
        </div>
    )
}