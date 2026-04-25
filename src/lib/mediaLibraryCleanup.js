/**
 * Storage dan o‘chirilgan fayl uchun public URL bo‘yicha jadvallarda havolani tozalash.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} publicUrl
 */
export async function removePublicUrlFromDatabase(supabase, publicUrl) {
    const url = String(publicUrl || '').trim()
    if (!url) return { ok: true, updates: 0 }

    const match = (cell) => cell != null && String(cell).trim() === url

    let updates = 0

    const { data: products, error: pe } = await supabase.from('products').select('id, image_url, images')
    if (!pe && products?.length) {
        for (const p of products) {
            const patch = {}
            if (match(p.image_url)) patch.image_url = ''
            if (Array.isArray(p.images)) {
                const next = p.images.filter((x) => !match(x))
                if (next.length !== p.images.length) patch.images = next
            }
            if (Object.keys(patch).length) {
                const { error } = await supabase.from('products').update(patch).eq('id', p.id)
                if (!error) updates += 1
            }
        }
    }

    const { data: cats, error: ce } = await supabase.from('categories').select('id, image_url')
    if (!ce && cats?.length) {
        for (const c of cats) {
            if (match(c.image_url)) {
                const { error } = await supabase.from('categories').update({ image_url: '' }).eq('id', c.id)
                if (!error) updates += 1
            }
        }
    }

    const { data: bns, error: be } = await supabase.from('banners').select('id, image_url')
    if (!be && bns?.length) {
        for (const b of bns) {
            if (match(b.image_url)) {
                const { error } = await supabase.from('banners').update({ image_url: '' }).eq('id', b.id)
                if (!error) updates += 1
            }
        }
    }

    const { data: albums, error: ae } = await supabase.from('album_images').select('id, image_url')
    if (!ae && albums?.length) {
        for (const a of albums) {
            if (match(a.image_url)) {
                const { error } = await supabase.from('album_images').update({ image_url: '' }).eq('id', a.id)
                if (!error) updates += 1
            }
        }
    }

    const { data: settings, error: se } = await supabase.from('settings').select('*').limit(1).maybeSingle()
    if (!se && settings?.id) {
        const URL_KEYS = [
            'logo_url',
            'hero_desktop_url',
            'hero_mobile_url',
            'about_hero_image',
            'about_mission_image',
        ]
        const patch = {}
        for (const k of URL_KEYS) {
            if (match(settings[k])) patch[k] = ''
        }
        if (settings.about_mission_images) {
            try {
                const raw = settings.about_mission_images
                const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
                if (Array.isArray(arr)) {
                    const next = arr.filter((x) => !match(x))
                    if (next.length !== arr.length) {
                        patch.about_mission_images = next.length ? JSON.stringify(next) : null
                        patch.about_mission_image = next[0] || ''
                    }
                }
            } catch {
                /* ignore */
            }
        }
        if (Object.keys(patch).length) {
            const { error } = await supabase.from('settings').update(patch).eq('id', settings.id)
            if (!error) updates += 1
        }
    }

    return { ok: true, updates }
}
