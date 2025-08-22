import { Router } from 'express'

const router = Router()

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Placeholder: chat route to be implemented next
router.post('/chat', async (req, res) => {
  // Expect: { message: string, conversationId?: string }
  const { message, conversationId } = req.body || {}
  if (!message) return res.status(400).json({ error: 'message is required' })

  // TODO: implement actual chat logic (LLM call, references, history, etc.)
  return res.json({
    conversationId: conversationId || 'temp-id',
    reply: 'این یک پاسخ نمونه از سرور است. لطفا مشخصات بک‌اند را بدهید تا کاملش کنم.',
    references: [],
  })
})

export default router
