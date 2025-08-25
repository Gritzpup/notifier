import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 6173,
    host: '0.0.0.0'
  },
  plugins: [
    sveltekit(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Notification Hub',
        short_name: 'NotifHub',
        description: 'Aggregate notifications from Discord, Telegram, and Twitch',
        theme_color: '#3b82f6',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.telegram\.org\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'telegram-api',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 300 // 5 minutes
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ]
});