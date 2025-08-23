import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import routes from './routes/index.js'
import http from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import BullMQPkg from 'bullmq'
import IORedis from 'ioredis'

const { Queue, Worker, QueueEvents } = BullMQPkg

const app = express()

// Config
const PORT = process.env.PORT || 3001
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:32768'

// Middlewares
app.use(cors({
  origin: '*',
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

// HTTP server + Socket.IO
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: { origin: '*', credentials: true },
})

io.on('connection', (socket) => {
  // eslint-disable-next-line no-console
  console.log('Socket connected:', socket.id)
  socket.on('disconnect', () => {
    // eslint-disable-next-line no-console
    console.log('Socket disconnected:', socket.id)
  })
})

// Redis connection for BullMQ
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,  // REQUIRED by BullMQ for blocking commands
  enableReadyCheck: false,     // recommended with BullMQ
  // If you change to rediss:// later, uncomment:
  // tls: {},
})
// Define queue and worker (single concurrency)
const chatQueueName = 'chat-jobs'
const chatQueue = new Queue(chatQueueName, { connection })
const chatQueueEvents = new QueueEvents(chatQueueName, { connection })

// Example worker that simulates calling an external LLM which can handle one at a time
const chatWorker = new Worker(
  chatQueueName,
  async (job) => {
    const { message, conversationId, clientId } = job.data || {}
    // Simulate external LLM processing delay
    await new Promise((resolve) => setTimeout(resolve, 1200))

    // TODO: Replace with real LLM call
    const reply = `پاسخ نمونه برای: "${message}"`
    const references = []

    // Emit result to client via socket if clientId provided
    if (clientId && io.sockets.sockets.get(clientId)) {
      io.to(clientId).emit('chat:response', {
        jobId: job.id,
        conversationId: conversationId || 'temp-id',
        reply,
        references,
      })
    }

    return { reply, conversationId: conversationId || 'temp-id', references }
  },
  { connection, concurrency: 1 }
)

chatWorker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error('Job failed', job?.id, err?.message)
  const clientId = job?.data?.clientId
  if (clientId) {
    io.to(clientId).emit('chat:error', { jobId: job?.id, error: err?.message || 'Job failed' })
  }
})

chatQueueEvents.on('waiting', ({ jobId }) => {
  // Optional: broadcast waiting status
  io.emit('chat:waiting', { jobId })
})

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

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`)
})
