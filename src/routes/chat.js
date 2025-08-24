import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import { authRequired } from '../middleware/auth.js'
import { listUserConversations, listConversationMessages, setMessageFeedback, deleteConversation } from '../services/chatStorage.js'
import { llmSpeech, llmSimilarity, llmSimilaritySearch } from '../services/llm.js'
import { logger } from '../services/logger.js'
import { extractTextFromBuffer } from '../services/extract.js'
import { sendOk, sendAccepted, sendFail } from '../utils/response.js'

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
    if (!req.file) return sendFail(res, 400, 'file is required', 'FILE_REQUIRED')
    const { originalname, mimetype, size, buffer } = req.file
    if (size > 3 * 1024 * 1024) return sendFail(res, 413, 'file too large (>3MB)', 'FILE_TOO_LARGE', { size })
    if (!ALLOWED_MIMES.has(mimetype)) return sendFail(res, 415, `unsupported file type: ${mimetype}`, 'UNSUPPORTED_TYPE', { mimetype })

    const text = await extractTextFromBuffer(buffer, originalname, mimetype)
    return sendOk(res, { text, name: originalname, size, mimetype })
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
      return sendFail(res, 400, 'message is required for action 1', 'MESSAGE_REQUIRED')
    }

    const chatQueue = req.app.get('chatQueue')
    if (!chatQueue) return sendFail(res, 500, 'Queue not initialized', 'QUEUE_NOT_INITIALIZED')

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
    return sendAccepted(res, { jobId: job.id })
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
    return sendOk(res, convos)
  } catch (err) {
    next(err)
  }
})

// Conversation messages
router.get('/conversations/:id/messages', authRequired, async (req, res, next) => {
  try {
    logger.info('route:list_messages', { userId: req.user.id, conversationId: req.params.id, reqId: req.id })
    const msgs = await listConversationMessages(req.user.id, req.params.id)
    return sendOk(res, msgs)
  } catch (err) {
    next(err)
  }
})

// Soft delete a conversation and its messages
router.delete('/conversations/:id', authRequired, async (req, res, next) => {
  try {
    logger.info('route:delete_conversation', { userId: req.user.id, conversationId: req.params.id, reqId: req.id })
    const out = await deleteConversation(req.user.id, req.params.id)
    return sendOk(res, out, 'Conversation deleted')
  } catch (err) {
    next(err)
  }
})

// Like/dislike a message
router.post('/messages/:id/feedback', authRequired, async (req, res, next) => {
  try {
    const { liked } = req.body || {}
    if (liked !== true && liked !== false) return sendFail(res, 400, 'liked must be true or false', 'VALIDATION_ERROR', { field: 'liked' })
    const msg = await setMessageFeedback(req.user.id, req.params.id, liked)
    return sendOk(res, msg)
  } catch (err) {
    next(err)
  }
})

// Optional: direct speech synthesis (not queued)
router.post('/speech', authRequired, async (req, res, next) => {
  try {
    const { text, options } = req.body || {}
    if (!text) return sendFail(res, 400, 'text is required', 'TEXT_REQUIRED')
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
    if (!a || !b) return sendFail(res, 400, 'a and b are required', 'VALIDATION_ERROR', { fields: ['a','b'] })
    const result = await llmSimilarity(a, b, options)
    return sendOk(res, result)
  } catch (err) {
    next(err)
  }
})

// Suggest queries or documents based on current user input (debounced on client)
router.post('/suggest', authRequired, async (req, res, next) => {
  try {
    const { q, options } = req.body || {}
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return sendFail(res, 400, 'q is required', 'VALIDATION_ERROR', { field: 'q' })
    }
    // Prefer the external similarity search GET /search
    const topK = Number(options?.top_k) > 0 ? Number(options.top_k) : 8
    const raw = await llmSimilaritySearch(q, topK)

    // Expected shape: { query, results: [ { question, answer, score, ... }, ...] }
    const results = Array.isArray(raw?.results) ? raw.results : []
    const suggestions = results
      .map(r => {
        const text = (r?.question || r?.answer || '').toString().trim()
        if (!text) return null
        const similarity = typeof r?.score === 'number' ? r.score : null
        return { text, similarity }
      })
      .filter(Boolean)
      .slice(0, topK)

    return sendOk(res, suggestions)
  } catch (err) {
    next(err)
  }
})

export default router
