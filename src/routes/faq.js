import { Router } from 'express'
import FAQ from '../models/FAQ.js'

const router = Router()

// Public: list active FAQs ordered
router.get('/', async (_req, res, next) => {
  try {
    const rows = await FAQ.find({ isActive: true }).sort({ order: 1, createdAt: -1 })
    res.json({ result: rows })
  } catch (err) { next(err) }
})

export default router
