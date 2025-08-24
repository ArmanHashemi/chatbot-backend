import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import { authRequired } from '../middleware/auth.js'
import { listUserConversations, listConversationMessages, setMessageFeedback, deleteConversation } from '../services/chatStorage.js'
import { llmSpeech, llmSimilarity } from '../services/llm.js'
import { logger } from '../services/logger.js'
import { extractTextFromBuffer } from '../services/extract.js'

const router = Router()

// Upload and extract text (no persistent storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
})

const ALLOWED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
])

router.post('/upload/extract-text', authRequired, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' })
    const { originalname, mimetype, size, buffer } = req.file
    if (size > 3 * 1024 * 1024) return res.status(413).json({ error: 'file too large (>3MB)' })
    if (!ALLOWED_MIMES.has(mimetype)) return res.status(415).json({ error: `unsupported file type: ${mimetype}` })

    const text = await extractTextFromBuffer(buffer, originalname, mimetype)
    return res.json({ result: { text, name: originalname, size, mimetype } })
  } catch (err) {
    logger.error('route:extract_error', { error: err.message, stack: err.stack })
    next(err)
  }
})

// Enqueue chat job; worker will emit response via WebSocket
router.post('/chat', authRequired, async (req, res, next) => {
  try {
    const { message, conversationId, action = 1, payload } = req.body || {}
    const clientId = req.header('x-client-id') || req.body?.clientId
    if (Number(action) === 1 && !message) {
      return res.status(400).json({ error: 'message is required for action 1' })
    }

    const chatQueue = req.app.get('chatQueue')
    if (!chatQueue) return res.status(500).json({ error: 'Queue not initialized' })

    logger.info('route:enqueue_chat', {
      userId: req.user.id,
      clientId,
      conversationId,
      messageLen: message?.length,
      action,
      reqId: req.id,
    })
    const job = await chatQueue.add('chat', { message, conversationId, clientId, userId: req.user.id, action, payload })
    logger.info('route:enqueue_ok', { jobId: job.id, reqId: req.id })
    return res.status(202).json({ result: { jobId: job.id } })
  } catch (err) {
    logger.error('route:enqueue_error', { error: err.message, stack: err.stack, reqId: req.id })
    return next(err)
  }
})

// List conversations for current user
router.get('/conversations', authRequired, async (req, res, next) => {
  try {
    logger.info('route:list_conversations', { userId: req.user.id, reqId: req.id })
    const convos = await listUserConversations(req.user.id)
    res.json({ result: convos })
  } catch (err) {
    next(err)
  }
})

// Conversation messages
router.get('/conversations/:id/messages', authRequired, async (req, res, next) => {
  try {
    logger.info('route:list_messages', { userId: req.user.id, conversationId: req.params.id, reqId: req.id })
    const msgs = await listConversationMessages(req.user.id, req.params.id)
    res.json({ result: msgs })
  } catch (err) {
    next(err)
  }
})

// Soft delete a conversation and its messages
router.delete('/conversations/:id', authRequired, async (req, res, next) => {
  try {
    logger.info('route:delete_conversation', { userId: req.user.id, conversationId: req.params.id, reqId: req.id })
    const out = await deleteConversation(req.user.id, req.params.id)
    res.json({ result: out })
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
