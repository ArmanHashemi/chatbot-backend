import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import routes from './routes/index.js'
import http from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import IORedis from 'ioredis'
import { connectDB } from './config/db.js'
import { registerSocketHandlers } from './sockets/index.js'
import { initChatQueue } from './queues/chatQueue.js'
import cookieParser from 'cookie-parser'

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

// HTTP server + Socket.IO
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: { origin: '*', credentials: true },
})

registerSocketHandlers(io)

// Redis connection for BullMQ
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

// Initialize chat queue with single concurrency worker
const { chatQueue, chatWorker, chatQueueEvents } = initChatQueue({ connection, io })

// Share io and queue to routes
app.set('io', io)
app.set('chatQueue', chatQueue)

// Routes
app.use('/api', routes)

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
  res.status(status).json({ error: err.message || 'Internal Server Error' })
})

// Start after DB connection
connectDB()
  .then(() => {
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

