/** Excel kutubxonalarini faqat kerak bo‘lganda yuklash (sahifa birinchi ochilishini yengillashtiradi). */

/** @returns {Promise<import('xlsx')>} */
export async function loadXlsx() {
    return import('xlsx')
}

/** @returns {Promise<typeof import('exceljs')>} */
export async function loadExcelJS() {
    const mod = await import('exceljs')
    return mod.default ?? mod
}
