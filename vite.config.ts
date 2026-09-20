import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: "./", plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'خزينتي',
        short_name: 'خزينتي',
        description: 'نظام خزينة نقدية شخصية',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#f0efe6',
        theme_color: '#16332e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // لا نخزّن استجابات Supabase API مؤقتًا — البيانات المالية يجب أن
        // تُقرأ دائمًا من الشبكة عند توفرها؛ العمل دون اتصال يُدار من
        // khizanti_lib_sync.ts (قائمة انتظار صريحة)، وليس عبر Cache عام.
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
