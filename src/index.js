import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import routes from './routes/index.js'
import difyRoutes from './routes/dify.js'
import http from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import IORedis from 'ioredis'
import { connectDB } from './config/db.js'
import { registerSocketHandlers } from './sockets/index.js'
import { initChatQueue } from './queues/chatQueue.js'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import { logger } from './services/logger.js'
import User from './models/User.js'
import ApiKey from './models/ApiKey.js'

const app = express()

// Config
const PORT = process.env.PORT || 3001
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

// Middlewares
app.use(cors({
  origin: '*',
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.use(morgan('dev'))

// Request ID and structured request logging
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID()
  const start = Date.now()
  const child = logger.child({ reqId: req.id, method: req.method, path: req.originalUrl })
  child.info('request:start', {
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
      authorization: req.headers['authorization'],
    },
  })
  res.setHeader('x-request-id', req.id)
  res.on('finish', () => {
    const duration = Date.now() - start
    child.info('request:finish', { status: res.statusCode, durationMs: duration })
  })
  next()
})

// HTTP server + Socket.IO
const server = http.createServer(app)
// Disable server-level timeouts to allow long-running requests over websockets/queues
server.requestTimeout = 0
server.headersTimeout = 0
// Optional: keepAlive tune
server.keepAliveTimeout = 0

const io = new SocketIOServer(server, {
  cors: { origin: '*', credentials: true },
})

// Redis connection for BullMQ
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

// Initialize chat queue with single concurrency worker
const { chatQueue, chatWorker, chatQueueEvents } = initChatQueue({ connection, io })

// Register socket handlers now that we have the queue instance
registerSocketHandlers(io, { chatQueue })

// Share io and queue to routes
app.set('io', io)
app.set('chatQueue', chatQueue)

// Routes
app.use('/api', routes)

// Dify API routes (mounted at root for /v1/chat-messages)
app.use('/', difyRoutes)

// Health root
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'chatbot-backend', time: new Date().toISOString() })
})

// 404 handler
app.use((req, res, next) => {
  if (res.headersSent) return next()
  res.status(404).json({ error: 'Not Found', path: req.originalUrl })
})

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500
  logger.error('request:error', { status, error: err.message, stack: err.stack })
  res.status(status).json({ error: err.message || 'Internal Server Error' })
})

// Start after DB connection
connectDB()
  .then(async () => {
    await ensureDefaultAdmin()
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend listening on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })

async function ensureDefaultAdmin() {
  try {
    // Create or update admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234'
    let adminUser = await User.findOne({ email: adminEmail })
    
    if (!adminUser) {
      const passwordHash = await User.hashPassword(adminPassword)
      adminUser = await User.create({ 
        email: adminEmail, 
        name: 'Admin', 
        passwordHash, 
        isAdmin: true 
      })
      logger.info('admin:seeded', { email: adminEmail })
    } else if (!adminUser.isAdmin) {
      adminUser.isAdmin = true
      await adminUser.save()
      logger.info('admin:granted', { email: adminEmail })
    }
    
    // Create test user if configured
    const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com'
    const testPassword = process.env.TEST_USER_PASSWORD || 'test1234'
    let testUser = await User.findOne({ email: testEmail })
    
    if (!testUser) {
      const testPasswordHash = await User.hashPassword(testPassword)
      testUser = await User.create({ 
        email: testEmail, 
        name: 'Test User', 
        passwordHash: testPasswordHash, 
        isAdmin: false 
      })
      logger.info('test:user_created', { email: testEmail })
    }
    
    // Create default test API key if configured
    const testApiKeyValue = process.env.DIFY_TEST_API_KEY || 'app-test-key-change-me-for-production'
    let testApiKey = await ApiKey.findOne({ key: testApiKeyValue })
    
    if (!testApiKey) {
      testApiKey = await ApiKey.create({
        userId: testUser._id,
        key: testApiKeyValue,
        name: 'Default Test API Key',
        isActive: true
      })
      logger.info('test:api_key_created', { 
        userId: testUser._id,
        email: testEmail,
        key: testApiKeyValue.slice(0, 20) + '...'
      })
    } else {
      // Update existing key to ensure it's linked to test user
      testApiKey.userId = testUser._id
      testApiKey.isActive = true
      await testApiKey.save()
      logger.info('test:api_key_updated', { userId: testUser._id })
    }
    
    // Log startup info
    logger.info('startup:ready', {
      adminEmail,
      testEmail,
      testApiKey: testApiKeyValue.slice(0, 20) + '...',
      testUserId: String(testUser._id),
      difyTestUserId: process.env.DIFY_TEST_USER_ID || 'test-user-id'
    })
    
    // Print to console for easy access
    console.log('\n' + '='.repeat(60))
    console.log('🚀 SYSTEM READY - Test Credentials')
    console.log('='.repeat(60))
    console.log('Admin Login:')
    console.log(`  Email: ${adminEmail}`)
    console.log(`  Password: ${adminPassword}`)
    console.log('\nTest API Access:')
    console.log(`  API Key: ${testApiKeyValue}`)
    console.log(`  User ID: ${process.env.DIFY_TEST_USER_ID || 'test-user-id'}`)
    console.log(`  Test Email: ${testEmail}`)
    console.log('\nAPI Endpoint:')
    console.log(`  POST http://localhost:${PORT}/v1/chat-messages`)
    console.log('='.repeat(60) + '\n')
    
  } catch (e) {
    logger.error('startup:error', { error: e.message, stack: e.stack })
  }
}

