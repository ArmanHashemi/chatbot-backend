import { Router } from 'express'
import authRouter from './auth.js'
import chatRouter from './chat.js'
import adminRouter from './admin.js'
import faqRouter from './faq.js'

const router = Router()

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

router.use('/auth', authRouter)
router.use('/', chatRouter)
router.use('/admin', adminRouter)
router.use('/faq', faqRouter)

export default router
