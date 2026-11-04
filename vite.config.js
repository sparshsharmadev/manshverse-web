import { Readable } from 'node:stream'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import chatHandler from './api/chat.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['GROQ_API_KEY', 'GROQ_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [
      react(),
      {
        name: 'manshverse-local-chat-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (new URL(req.url || '/', 'http://localhost').pathname !== '/api/chat') return next()

            try {
              const headers = new Headers()
              for (const [key, value] of Object.entries(req.headers)) {
                if (value && !['connection', 'content-length', 'host', 'transfer-encoding'].includes(key.toLowerCase())) {
                  headers.set(key, Array.isArray(value) ? value.join(', ') : value)
                }
              }
              const request = new Request(new URL(req.url || '/', 'http://localhost'), {
                method: req.method,
                headers,
                ...(req.method && !['GET', 'HEAD'].includes(req.method)
                  ? { body: Readable.toWeb(req), duplex: 'half' }
                  : {}),
              })
              const response = await chatHandler(request)
              res.statusCode = response.status
              response.headers.forEach((value, key) => res.setHeader(key, value))
              if (!response.body) return res.end()
              Readable.fromWeb(response.body).pipe(res)
            } catch {
              if (!res.headersSent) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: { message: 'The local AI route failed to start.' } }))
              } else res.destroy()
            }
          })
        },
      },
    ],
  }
})
