import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import http from 'http'
import { Server as SocketServer } from 'socket.io'
import dotenv from 'dotenv'
import './models/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { UPLOADS_DIR } from './middleware/upload.js'
import { resolveTenant, enforceTenantAccessible } from './middleware/tenant.js'
import authRoutes from './routes/auth.js'
import platformRoutes from './routes/platform.js'
import homeRoutes from './routes/home.js'
import projectRoutes from './routes/projects.js'
import taskRoutes from './routes/tasks.js'
import moduleRoutes from './routes/modules.js'
import mailRoutes from './routes/mail.js'
import calendarRoutes from './routes/calendar.js'
import spacesRoutes from './routes/spaces.js'
import channelsRoutes from './routes/channels.js'
import customFieldsRoutes from './routes/customFields.js'
import approvalRoutes from './routes/approvals.js'
import companyAdminRoutes from './routes/companyAdmin.js'
import impactRoutes from './routes/impact.js'
import inventoryRoutes from './routes/inventory.js'
import rfqRoutes from './routes/rfq.js'
import billingRoutes from './routes/billing.js'
import taxInvoiceRoutes from './routes/taxInvoices.js'
import procurementFlowRoutes from './routes/procurementFlow.js'
import mediaRoutes from './routes/media.js'
import workspaceSettingsRoutes from './routes/workspaceSettings.js'

import { registerSocketAuth, registerSocketHandlers } from './lib/socketAuth.js'

dotenv.config()

function parseOrigins() {
  const raw =
    process.env.CLIENT_URL ||
    process.env.CLIENT_URLS ||
    'http://localhost:5173'
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const allowedOrigins = parseOrigins()

export function corsOrigin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true)
    return
  }
  try {
    if (origin) {
      const host = new URL(origin).hostname
      if (host === 'localhost' || host === '127.0.0.1') {
        callback(null, true)
        return
      }
      if (
        host.endsWith('.editcomedia.com') ||
        host === 'editcomedia.com'
      ) {
        callback(null, true)
        return
      }
      // Vercel SPA + API split — set CLIENT_URL to your exact frontend origin in prod.
      // Set ALLOW_VERCEL_PREVIEWS=false to lock down to CLIENT_URL only.
      if (
        process.env.ALLOW_VERCEL_PREVIEWS !== 'false' &&
        host.endsWith('.vercel.app')
      ) {
        callback(null, true)
        return
      }
    }
  } catch {
    /* ignore */
  }
  callback(null, false)
}

/** No-op Socket.IO stand-in for serverless (Vercel) where websockets are unavailable. */
function createNoopIo() {
  return {
    to() {
      return this
    },
    emit() {},
    on() {},
  }
}

/**
 * Build the Express app.
 * @param {{ enableSockets?: boolean }} [opts]
 * @returns {{ app: import('express').Express, server?: import('http').Server, io: any }}
 */
export function createApp({ enableSockets = true } = {}) {
  const app = express()
  let server
  let io

  if (enableSockets) {
    server = http.createServer(app)
    io = new SocketServer(server, {
      cors: {
        origin: corsOrigin,
        credentials: true,
      },
    })
    registerSocketAuth(io)
    registerSocketHandlers(io)
  } else {
    io = createNoopIo()
  }

  app.set('io', io)

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '10mb' }))
  app.use(cookieParser())
  app.use('/uploads', express.static(UPLOADS_DIR))
  app.use('/api/media', mediaRoutes)

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'cubic-api',
      runtime: process.env.VERCEL ? 'vercel' : 'node',
    })
  })

  app.use('/api', resolveTenant)

  // Auth (login needs its own, narrower check — see auth.js) and platform
  // admin (never scoped to one company's subscription) run before the gate;
  // every ordinary app route runs after it.
  app.use('/api/auth', authRoutes)
  app.use('/api/platform', platformRoutes)
  app.use('/api', enforceTenantAccessible)

  app.use('/api', homeRoutes)
  app.use('/api/projects', projectRoutes)
  app.use('/api/tasks', taskRoutes)
  app.use('/api/custom-fields', customFieldsRoutes)
  app.use('/api/approvals', approvalRoutes)
  app.use('/api/company-admin', companyAdminRoutes)
  app.use('/api', moduleRoutes)
  app.use('/api', impactRoutes)
  app.use('/api', inventoryRoutes)
  app.use('/api', rfqRoutes)
  app.use('/api', billingRoutes)
  app.use('/api', taxInvoiceRoutes)
  app.use('/api', procurementFlowRoutes)
  app.use('/api', mailRoutes)
  app.use('/api', calendarRoutes)
  app.use('/api', spacesRoutes)
  app.use('/api', channelsRoutes)
  app.use('/api/settings', workspaceSettingsRoutes)

  app.use(errorHandler)

  return { app, server, io }
}
