import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import routes from './routes/index.js'

const app = express()

// Config
const PORT = process.env.PORT || 3001
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

// Middlewares
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT} (CORS: ${FRONTEND_ORIGIN})`)
})
