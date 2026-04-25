const { test, expect } = require('@playwright/test')

test.describe('smoke', () => {
    test('login sahifasi ochiladi', async ({ page }) => {
        await page.goto('/login')
        await expect(page).toHaveURL(/\/login/)
        await expect(page.locator('body')).toBeVisible()
    })

    test('bosh sahifa javob beradi (SSR/klient)', async ({ page }) => {
        const res = await page.goto('/', { waitUntil: 'domcontentloaded' })
        expect(res?.ok()).toBeTruthy()
        await expect(page.locator('body')).toBeVisible()
    })
})
