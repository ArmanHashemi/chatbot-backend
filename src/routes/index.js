import { Router } from 'express'

const router = Router()

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Enqueue chat job; worker will emit response via WebSocket
router.post('/chat', async (req, res, next) => {
  try {
    const { message, conversationId } = req.body || {}
    const clientId = req.header('x-client-id') || req.body?.clientId
    if (!message) return res.status(400).json({ error: 'message is required' })

    const chatQueue = req.app.get('chatQueue')
    if (!chatQueue) return res.status(500).json({ error: 'Queue not initialized' })

    const job = await chatQueue.add('chat', { message, conversationId, clientId })
    return res.status(202).json({ jobId: job.id })
  } catch (err) {
    return next(err)
  }
})

export default router
