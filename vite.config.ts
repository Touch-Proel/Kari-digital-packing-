import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        selfDestroying: true,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Remix Packing OS & Live Stream Orders',
          short_name: 'RemixPacking',
          description: 'Mobile digital packing OS for Facebook Live stream comment orders, basket allocation, and 2-stage QC fulfillment.',
          theme_color: '#060D1D',
          background_color: '#060D1D',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globIgnores: ['**/uploads/**', '**/server.cjs*', '**/*.map'],
          navigateFallbackDenylist: [/^\/api/, /^\/miniapp/, /^\/shop/, /^\/tg-shop/],
        },
      })
    ],
    build: {
      emptyOutDir: false,
      copyPublicDir: false,
      sourcemap: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true, or ignore database and server files
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/server/**',
          '**/dist/**',
          '**/*.db',
          '**/*.db-*',
          '**/db_store.json',
          '**/public/uploads/**',
          '**/uploads/**'
        ]
      },
    },
    preview: {
      allowedHosts: true as const,
    },
  };
});
