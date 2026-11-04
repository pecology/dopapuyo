import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のサブパス（/<repo>/）でも動くよう相対パスで出力する
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  plugins: [
    // PWA: 一度開けば、以後はオフラインでも遊べるようにする
    VitePWA({
      // 新しい版は勝手に切り替えず、main.ts がメニュー画面のときに切り替える
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'どぱぷよ',
        short_name: 'どぱぷよ',
        description: '上級者向け連鎖スコアアタック（非公式ファンメイド作品）',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0d1a',
        theme_color: '#0e0d1a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,webmanifest}'],
        // 文字のフォント（Google Fonts）も一度読んだら端末に保存しておく。
        // 日本語フォントは文字の範囲ごとに細かいファイルに分かれているので、フォント本体は多めに保存できるようにする
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-css',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
