export default function StatCard({ icon: Icon, title, value, color, trend }) {
    return (
        <div className={`${color} text-white p-6 rounded-xl shadow-lg`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm opacity-80 mb-2">{title}</p>
                    <p className="text-3xl font-bold">{value}</p>
                    {trend && (
                        <p className="text-sm mt-2 opacity-90">
                            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% dan o'tgan oy
                        </p>
                    )}
                </div>
                <div className="bg-white bg-opacity-20 p-3 rounded-lg">
                    <Icon size={28} />
                </div>
            </div>
        </div>
    )
}