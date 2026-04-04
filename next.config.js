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
  /** Windows: buzilgan .next / Watchpack C:\\ skaneri xatolarini kamaytirish */
  webpack: (config, { dev }) => {
    if (dev && process.platform === 'win32') {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
        ],
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