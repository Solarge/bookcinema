import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// All proxy targets — cloud + local self-hosted
const CLOUD_PROXIES = {
  '/anthropic':  'https://api.anthropic.com',
  '/openai':     'https://api.openai.com',
  '/replicate':  'https://api.replicate.com',
  '/runway':     'https://api.dev.runwayml.com',
  '/elevenlabs': 'https://api.elevenlabs.io',
  '/groq':       'https://api.groq.com',
  '/deepseek':   'https://api.deepseek.com',
  '/gemini':     'https://generativelanguage.googleapis.com',
  '/stabilityai':'https://api.stability.ai',
  '/lumaai':     'https://api.lumalabs.ai',
  '/minimax':    'https://api.minimax.io',
  '/klingdirect':'https://api.klingai.com',
  '/googletts':  'https://texttospeech.googleapis.com',
}

// Local self-hosted proxies (default ports — users can change in Settings)
const LOCAL_PROXIES = {
  '/local-ollama': 'http://localhost:11434',
  '/local-a1111':  'http://localhost:7860',
  '/local-comfyui':'http://localhost:8188',
  '/local-video':  'http://localhost:7861',
  '/local-kokoro': 'http://localhost:8880',
  '/local-xtts':   'http://localhost:8020',
}

function makeProxyEntries(map) {
  return Object.fromEntries(
    Object.entries(map).map(([path, target]) => [
      path,
      { target, changeOrigin: true, rewrite: p => p.replace(new RegExp(`^${path}`), '') },
    ])
  )
}

const PWA_CONFIG = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg'],
  manifest: {
    name: 'BookFilm Studio',
    short_name: 'BookFilm',
    description: 'Turn any book into a cinematic AI video series',
    theme_color: '#080b10',
    background_color: '#080b10',
    display: 'standalone',
    icons: [
      { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    runtimeCaching: [
      { urlPattern: /^https:\/\/fonts\.googleapis\.com/, handler: 'CacheFirst', options: { cacheName: 'google-fonts' } },
    ],
  },
})

export default defineConfig(({ command, mode }) => {
  // ── VITE_API_URL build guard ────────────────────────────────────────────────
  // In a production build, the fallback to localhost:3001 means every API call
  // will fail for any non-local host.  Fail loudly so the CI/deployment doesn't
  // silently ship a broken frontend.
  if (command === 'build' && mode === 'production') {
    if (!process.env.VITE_API_URL) {
      throw new Error(
        '\n[vite] VITE_API_URL is not set.\n' +
        'A production build without it will fall back to http://localhost:3001\n' +
        'and all API calls will fail on any non-local host.\n' +
        'Set VITE_API_URL to your backend URL (e.g. https://api.bookfilm.studio)\n' +
        'or pass  VITE_API_URL=... npm run build  to proceed.\n'
      )
    }
  }

  return {
    plugins: [tailwindcss(), react(), PWA_CONFIG],

    server: {
      proxy: {
        ...makeProxyEntries(CLOUD_PROXIES),
        ...makeProxyEntries(LOCAL_PROXIES),
      },
    },

    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // pdfjs-dist is ~600 KB+ on its own — give it a dedicated chunk so
            // it doesn't block the initial JS parse for users who never upload a PDF.
            if (id.includes('pdfjs-dist')) return 'pdfjs'

            // Core React runtime — tiny but often already cached by the browser.
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/')) return 'react-vendor'

            // Everything else in node_modules gets a shared vendor chunk so
            // app-code changes don't bust the third-party cache.
            if (id.includes('node_modules/')) return 'vendor'
          },
        },
      },
    },
  }
})
