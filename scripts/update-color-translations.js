const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local')
    if (!fs.existsSync(p)) throw new Error('.env.local topilmadi')
    const env = fs.readFileSync(p, 'utf8')
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim()
    const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim()
    return createClient(url, key)
}

const colorTranslations = {
    'Antik': {
        name_uz: 'Antik',
        name_ru: 'Античный',
        name_en: 'Antique'
    },
    'gold': {
        name_uz: 'Gold (oltin)',
        name_ru: 'Золотой',
        name_en: 'Gold'
    },
    "ho'l asfalt (41482)": {
        name_uz: "Ho'l asfalt (41482)",
        name_ru: 'Мокрый асфальт (41482)',
        name_en: 'Wet asphalt (41482)'
    },
    'kofe': {
        name_uz: 'Kofe',
        name_ru: 'Кофейный',
        name_en: 'Coffee'
    },
    'kofe(40744)': {
        name_uz: 'Kofe (40744)',
        name_ru: 'Кофейный (40744)',
        name_en: 'Coffee (40744)'
    },
    'kumush(tilla)': {
        name_uz: 'Kumush (tilla)',
        name_ru: 'Серебристый (золото)',
        name_en: 'Silver (gold)'
    },
    'Malina': {
        name_uz: 'Malina',
        name_ru: 'Малиновый',
        name_en: 'Raspberry'
    },
    'miks': {
        name_uz: 'Miks',
        name_ru: 'Микс',
        name_en: 'Mix'
    },
    'Mis': {
        name_uz: 'Mis',
        name_ru: 'Медный',
        name_en: 'Copper'
    },
    'mokriy (41482)': {
        name_uz: 'Mokriy (41482)',
        name_ru: 'Мокрый асфальт (41482)',
        name_en: 'Wet asphalt (41482)'
    },
    'novot': {
        name_uz: 'Novot',
        name_ru: 'Нават',
        name_en: 'Navat',
        hex_code: '#F5E6C8'
    },
    'novot (41067)': {
        name_uz: 'Novot (41067)',
        name_ru: 'Нават (41067)',
        name_en: 'Navat (41067)'
    },
    "O'rik": {
        name_uz: "O'rik",
        name_ru: 'Абрикосовый',
        name_en: 'Apricot'
    },
    'och kofe': {
        name_uz: 'Och kofe',
        name_ru: 'Светло-кофейный',
        name_en: 'Light coffee'
    },
    'och kofe(40752)': {
        name_uz: 'Och kofe (40752)',
        name_ru: 'Бежевый (40752)',
        name_en: 'Beige (40752)'
    },
    'Oltin': {
        name_uz: 'Oltin',
        name_ru: 'Золотой',
        name_en: 'Gold'
    },
    'Oq': {
        name_uz: 'Oq',
        name_ru: 'Белый',
        name_en: 'White'
    },
    'oq(40447)': {
        name_uz: 'Oq (40447)',
        name_ru: 'Белый (40447)',
        name_en: 'White (40447)',
        hex_code: '#FFFFFF'
    },
    'Pushti': {
        name_uz: 'Pushti',
        name_ru: 'Розовый',
        name_en: 'Pink'
    },
    'qaymoq': {
        name_uz: 'Qaymoq',
        name_ru: 'Кремовый',
        name_en: 'Cream'
    },
    'qaymoq (41458)': {
        name_uz: 'Qaymoq (41458)',
        name_ru: 'Кремовый (41458)',
        name_en: 'Cream (41458)'
    },
    'Qora': {
        name_uz: 'Qora',
        name_ru: 'Черный',
        name_en: 'Black'
    },
    'seriy': {
        name_uz: 'Seriy (kulrang)',
        name_ru: 'Серый',
        name_en: 'Gray'
    },
    'seriy(40823)': {
        name_uz: 'Seriy (40823)',
        name_ru: 'Серый (40823)',
        name_en: 'Gray (40823)'
    },
    'seriy+mokriy': {
        name_uz: 'Seriy + mokriy',
        name_ru: 'Серый + мокрый асфальт',
        name_en: 'Gray + wet asphalt'
    },
    'Shaftoli': {
        name_uz: 'Shaftoli',
        name_ru: 'Персиковый',
        name_en: 'Peach'
    },
    'shampan': {
        name_uz: 'Shampan',
        name_ru: 'Шампань',
        name_en: 'Champagne'
    },
    'Tilla': {
        name_uz: 'Tilla',
        name_ru: 'Золотой',
        name_en: 'Gold'
    },
    'Tilla (40686)': {
        name_uz: 'Tilla (40686)',
        name_ru: 'Золотой (40686)',
        name_en: 'Gold (40686)'
    },
    'Tilla + Qaymoq': {
        name_uz: 'Tilla + Qaymoq',
        name_ru: 'Золотой + кремовый',
        name_en: 'Gold + cream',
        hex_code: '#E5D480'
    },
    'Tilla + Qora': {
        name_uz: 'Tilla + Qora',
        name_ru: 'Золотой + черный',
        name_en: 'Gold + black',
        hex_code: '#3D3728'
    },
    "To'q ko'k": {
        name_uz: "To'q ko'k",
        name_ru: 'Темно-синий',
        name_en: 'Dark blue'
    },
    "To'q kofe": {
        name_uz: "To'q kofe",
        name_ru: 'Темный кофе',
        name_en: 'Dark coffee'
    },
    "To'q kulrang": {
        name_uz: "To'q kulrang",
        name_ru: 'Темно-серый',
        name_en: 'Dark gray'
    },
    'xrom': {
        name_uz: 'Xrom',
        name_ru: 'Хром',
        name_en: 'Chrome'
    }
}

async function updateColors() {
    const supabase = loadEnvLocal()
    console.log('Ranglar tarjimasini yangilash boshlandi...')

    let updatedCount = 0
    for (const [key, data] of Object.entries(colorTranslations)) {
        const updatePayload = {
            name_uz: data.name_uz,
            name_ru: data.name_ru,
            name_en: data.name_en
        }
        if (data.hex_code) {
            updatePayload.hex_code = data.hex_code
        }

        const { data: res, error } = await supabase
            .from('product_colors')
            .update(updatePayload)
            .eq('name', key)
            .select()

        if (error) {
            console.error(`Xatolik: ${key} ->`, error.message)
        } else if (res && res.length > 0) {
            updatedCount++
            console.log(`[OK] ${key} -> UZ: "${data.name_uz}", RU: "${data.name_ru}", EN: "${data.name_en}"`)
        } else {
            console.warn(`[OGOHLANTIRISH] ${key} topilmadi!`)
        }
    }

    console.log(`\nJami yangilandi: ${updatedCount}/${Object.keys(colorTranslations).length}`)
}

updateColors()
