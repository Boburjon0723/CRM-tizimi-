'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import { useLayout } from '@/context/LayoutContext'
import { useLanguage } from '@/context/LanguageContext'
import { useDialog } from '@/context/DialogContext'
import { removePublicUrlFromDatabase } from '@/lib/mediaLibraryCleanup'
import { ImageIcon, Trash2, RefreshCw, Copy, ExternalLink, Filter, FolderOpen } from 'lucide-react'

const BUCKETS = ['products', 'models']

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp|avif)$/i

function isImagePath(path) {
    return IMAGE_EXT.test(path || '')
}

async function listStorageFilesRecursive(supabaseClient, bucket, prefix = '', depth = 0, acc = []) {
    if (depth > 30 || acc.length > 4000) return acc
    const { data, error } = await supabaseClient.storage.from(bucket).list(prefix || '', {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    for (const item of data || []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name
        const isFile = item.metadata && typeof item.metadata.size === 'number'
        if (!isFile) {
            await listStorageFilesRecursive(supabaseClient, bucket, path, depth + 1, acc)
        } else {
            acc.push({
                bucket,
                path,
                size: item.metadata?.size ?? 0,
                mime: item.metadata?.mimetype || '',
                updated_at: item.updated_at,
            })
        }
    }
    return acc
}

export default function MediaLibraryPage() {
    const { toggleSidebar } = useLayout()
    const { t } = useLanguage()
    const { showAlert, showConfirm } = useDialog()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState(null)
    const [imagesOnly, setImagesOnly] = useState(false)
    const [activeBucket, setActiveBucket] = useState('all')

    const loadAll = useCallback(async () => {
        setLoading(true)
        try {
            const acc = []
            const bucketsToScan = activeBucket === 'all' ? BUCKETS : [activeBucket]
            for (const b of bucketsToScan) {
                await listStorageFilesRecursive(supabase, b, '', 0, acc)
            }
            acc.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`))
            setItems(acc)
        } catch (e) {
            console.error(e)
            await showAlert(`${t('mediaLibrary.loadError')}\n${e.message || ''}`, { variant: 'error' })
            setItems([])
        } finally {
            setLoading(false)
        }
    }, [activeBucket, showAlert, t])

    useEffect(() => {
        loadAll()
    }, [loadAll])

    const filtered = useMemo(() => {
        if (!imagesOnly) return items
        return items.filter((x) => isImagePath(x.path) || (x.mime && x.mime.startsWith('image/')))
    }, [items, imagesOnly])

    const getPublicUrl = (bucket, path) => {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || ''
    }

    const handleDelete = async (row) => {
        const pub = getPublicUrl(row.bucket, row.path)
        const ok = await showConfirm(
            `${t('mediaLibrary.deleteConfirmDetail')}\n\n${row.bucket}/${row.path}`,
            { title: t('mediaLibrary.delete'), variant: 'warning' }
        )
        if (!ok) return
        setDeleting(`${row.bucket}:${row.path}`)
        try {
            const { error } = await supabase.storage.from(row.bucket).remove([row.path])
            if (error) throw error
            const { updates } = await removePublicUrlFromDatabase(supabase, pub)
            setItems((prev) => prev.filter((x) => !(x.bucket === row.bucket && x.path === row.path)))
            await showAlert(
                updates > 0
                    ? `${t('mediaLibrary.deleted')} ${t('mediaLibrary.dbRowsHint')} (${updates})`
                    : t('mediaLibrary.deleted'),
                { variant: 'success' }
            )
        } catch (e) {
            console.error(e)
            await showAlert((e && e.message) || t('common.deleteError'), { variant: 'error' })
        } finally {
            setDeleting(null)
        }
    }

    const copyUrl = async (url) => {
        try {
            await navigator.clipboard.writeText(url)
            await showAlert(t('mediaLibrary.copied'), { variant: 'success' })
        } catch {
            await showAlert(t('common.saveError'), { variant: 'error' })
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <Header title={t('mediaLibrary.title')} toggleSidebar={toggleSidebar} />
            <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
                <p className="text-sm text-gray-600 max-w-3xl">{t('mediaLibrary.intro')}</p>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => loadAll()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        {t('mediaLibrary.refresh')}
                    </button>
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white">
                        <FolderOpen size={18} className="text-gray-500" />
                        <select
                            value={activeBucket}
                            onChange={(e) => setActiveBucket(e.target.value)}
                            className="bg-transparent text-sm font-medium outline-none"
                        >
                            <option value="all">{t('mediaLibrary.allBuckets')}</option>
                            {BUCKETS.map((b) => (
                                <option key={b} value={b}>
                                    {b}
                                </option>
                            ))}
                        </select>
                    </div>
                    <label className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white cursor-pointer">
                        <Filter size={18} className="text-gray-500" />
                        <input
                            type="checkbox"
                            checked={imagesOnly}
                            onChange={(e) => setImagesOnly(e.target.checked)}
                        />
                        <span className="text-sm">{t('mediaLibrary.imagesOnly')}</span>
                    </label>
                    <span className="text-sm text-gray-500">
                        {filtered.length} / {items.length}
                    </span>
                </div>

                {loading ? (
                    <div className="flex justify-center py-24">
                        <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-gray-500 bg-white rounded-xl border border-gray-100">
                        <ImageIcon className="mx-auto mb-3 text-gray-300" size={48} />
                        {t('mediaLibrary.empty')}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filtered.map((row) => {
                            const url = getPublicUrl(row.bucket, row.path)
                            const img = isImagePath(row.path) || (row.mime && row.mime.startsWith('image/'))
                            const key = `${row.bucket}:${row.path}`
                            return (
                                <div
                                    key={key}
                                    className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col"
                                >
                                    <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                                        {img ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                                        ) : (
                                            <span className="text-xs text-gray-400 px-2 text-center break-all">
                                                {row.path.split('.').pop() || '—'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3 flex-1 flex flex-col gap-2">
                                        <div className="text-[11px] font-mono text-gray-500 truncate" title={row.path}>
                                            <span className="text-blue-700 font-semibold">{row.bucket}</span>/{row.path}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {(row.size / 1024).toFixed(1)} KB
                                            {row.mime ? ` · ${row.mime}` : ''}
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-auto pt-2">
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                            >
                                                <ExternalLink size={14} />
                                                {t('mediaLibrary.open')}
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => copyUrl(url)}
                                                className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600"
                                            >
                                                <Copy size={14} />
                                                {t('mediaLibrary.copy')}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={deleting === key}
                                                onClick={() => handleDelete(row)}
                                                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 ml-auto disabled:opacity-50"
                                            >
                                                <Trash2 size={14} />
                                                {deleting === key ? t('common.loading') : t('common.delete')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
