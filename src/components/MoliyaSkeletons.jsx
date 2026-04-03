export function MoliyaCardSkeleton() {
    return (
        <div className="animate-pulse space-y-4" aria-hidden>
            <div className="h-4 w-40 bg-gray-200 rounded-lg" />
            <div className="h-32 bg-gray-100 rounded-2xl border border-gray-200" />
            <div className="space-y-2">
                <div className="h-14 bg-gray-100 rounded-xl" />
                <div className="h-14 bg-gray-100 rounded-xl" />
                <div className="h-14 bg-gray-100 rounded-xl" />
            </div>
        </div>
    )
}
