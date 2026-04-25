/**
 * public/favicon.svg → public/apple-touch-icon.png (180×180)
 * ishga tushirish: npm run icons:apple
 */
const path = require('path')
const sharp = require('sharp')

const publicDir = path.join(__dirname, '..', 'public')
const svgPath = path.join(publicDir, 'favicon.svg')
const outPath = path.join(publicDir, 'apple-touch-icon.png')

async function main() {
    try {
        await sharp(svgPath).resize(180, 180, { fit: 'cover' }).png().toFile(outPath)
        console.log('apple-touch-icon.png yaratildi:', outPath)
    } catch (e) {
        console.warn('SVG dan PNG xato, rangli fallback:', e.message)
        await sharp({
            create: {
                width: 180,
                height: 180,
                channels: 3,
                background: { r: 15, g: 76, b: 92 },
            },
        })
            .png()
            .toFile(outPath)
        console.log('Fallback PNG:', outPath)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
