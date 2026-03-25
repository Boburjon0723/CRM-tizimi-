const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  /**
   * Deploydan keyin eski sahifa ko‘rinmasin: navigatsiyani agressiv keshlamaslik.
   * (Aks holda service worker eski HTML/JS ni uzoq saqlab qoladi.)
   */
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  swcMinify: true,
  /** Dev rejimda PWA o‘chiq — server tezroq ishga tushadi, port muammosi kamayadi */
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: false, // SWC ni o'chirish
}

module.exports = withPWA(nextConfig);