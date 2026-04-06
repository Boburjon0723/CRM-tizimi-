/**
 * PWA faqat NEXT_PUBLIC_ENABLE_PWA=true bo‘lsa prod da yoqiladi.
 * Standart: o‘chiq — service worker bo‘lmaganda deploydan keyin yangi kod darhol ko‘rinadi.
 */
const enablePwa = process.env.NEXT_PUBLIC_ENABLE_PWA === 'true'

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: 'public',
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  swcMinify: true,
  /** Dev: PWA yo‘q. Prod: faqat enablePwa bo‘lsa. */
  disable: process.env.NODE_ENV === 'development' || !enablePwa,
  workboxOptions: {
    disableDevLogs: true,
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: false, // SWC ni o'chirish
  /** Windows: Watchpack — faqat string glob (RegExp Next ichida bo‘lishi mumkin, webpack schema rad etadi) */
  webpack: (config, { dev }) => {
    if (dev && process.platform === 'win32') {
      const prev = config.watchOptions?.ignored
      const extra = ['**/node_modules/**', '**/.git/**', '**/.next/**']
      const fromPrev = []
      const walk = (v) => {
        if (v == null) return
        if (typeof v === 'string' && v.length > 0) fromPrev.push(v)
        else if (Array.isArray(v)) v.forEach(walk)
      }
      walk(prev)
      const ignored = [...new Set([...fromPrev, ...extra])]
      config.watchOptions = {
        ...config.watchOptions,
        ignored,
        followSymlinks: false,
        ...(process.env.NEXT_WEBPACK_POLL === '1' ? { poll: 1000 } : {}),
      }
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/buyurtmalar',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig)