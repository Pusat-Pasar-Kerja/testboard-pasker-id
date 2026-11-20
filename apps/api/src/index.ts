import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config/env.js'

// Local development convenience: load apps/api/.env when present (never committed).
if (existsSync('.env')) process.loadEnvFile('.env')

const config = loadConfig(process.env)
const app = createApp({ config })

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(
    `[testboard-api] listening on http://${info.address}:${info.port} (${config.nodeEnv})`,
  )
})

function shutdown(signal: string) {
  console.log(`[testboard-api] ${signal} received, shutting down`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
