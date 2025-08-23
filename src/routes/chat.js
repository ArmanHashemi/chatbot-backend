import { Router } from 'express'
import { authRequired } from '../middleware/auth.js'
import { listUserConversations, listConversationMessages, setMessageFeedback } from '../services/chatStorage.js'
import { llmSpeech, llmSimilarity } from '../services/llm.js'

const router = Router()

// Enqueue chat job; worker will emit response via WebSocket
router.post('/chat', authRequired, async (req, res, next) => {
  try {
    const { message, conversationId } = req.body || {}
    const clientId = req.header('x-client-id') || req.body?.clientId
    if (!message) return res.status(400).json({ error: 'message is required' })

    const chatQueue = req.app.get('chatQueue')
    if (!chatQueue) return res.status(500).json({ error: 'Queue not initialized' })

    const job = await chatQueue.add('chat', { message, conversationId, clientId, userId: req.user.id })
    return res.status(202).json({ result: { jobId: job.id } })
  } catch (err) {
    return next(err)
  }
})

// List conversations for current user
router.get('/conversations', authRequired, async (req, res, next) => {
  try {
    const convos = await listUserConversations(req.user.id)
    res.json({ result: convos })
  } catch (err) {
    next(err)
  }
})

// Conversation messages
router.get('/conversations/:id/messages', authRequired, async (req, res, next) => {
  try {
    const msgs = await listConversationMessages(req.user.id, req.params.id)
    res.json({ result: msgs })
  } catch (err) {
    next(err)
  }
})

// Like/dislike a message
router.post('/messages/:id/feedback', authRequired, async (req, res, next) => {
  try {
    const { liked } = req.body || {}
    if (liked !== true && liked !== false) return res.status(400).json({ error: 'liked must be true or false' })
    const msg = await setMessageFeedback(req.user.id, req.params.id, liked)
    res.json({ result: msg })
  } catch (err) {
    next(err)
  }
})

// Optional: direct speech synthesis (not queued)
router.post('/speech', authRequired, async (req, res, next) => {
  try {
    const { text, options } = req.body || {}
    if (!text) return res.status(400).json({ error: 'text is required' })
    const audioBuffer = await llmSpeech(text, options)
    res.setHeader('Content-Type', 'application/octet-stream')
    return res.send(Buffer.from(audioBuffer))
  } catch (err) {
    next(err)
  }
})

// Optional: direct similarity endpoint (not queued)
router.post('/similarity', authRequired, async (req, res, next) => {
  try {
    const { a, b, options } = req.body || {}
    if (!a || !b) return res.status(400).json({ error: 'a and b are required' })
    const result = await llmSimilarity(a, b, options)
    res.json({ result })
  } catch (err) {
    next(err)
  }
})

export default router
