import { Router } from 'express'
import { authRequired, adminRequired } from '../middleware/auth.js'
import User from '../models/User.js'
import Document from '../models/Document.js'

const router = Router()

// Users
router.get('/users', authRequired, adminRequired, async (_req, res, next) => {
  try {
    const users = await User.find({}, { passwordHash: 0 }).sort({ createdAt: -1 })
    res.json({ result: users })
  } catch (err) { next(err) }
})

router.patch('/users/:id/admin', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const { isAdmin } = req.body || {}
    const user = await User.findByIdAndUpdate(id, { isAdmin: !!isAdmin }, { new: true }).select('-passwordHash')
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ result: user })
  } catch (err) { next(err) }
})

// POST alias (some clients use POST from forms)
router.post('/users/:id/admin', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const { isAdmin } = req.body || {}
    const user = await User.findByIdAndUpdate(id, { isAdmin: !!isAdmin }, { new: true }).select('-passwordHash')
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ result: user })
  } catch (err) { next(err) }
})

// Documents CRUD
router.get('/documents', authRequired, adminRequired, async (_req, res, next) => {
  try {
    const docs = await Document.find().sort({ createdAt: -1 })
    res.json({ result: docs })
  } catch (err) { next(err) }
})

router.post('/documents', authRequired, adminRequired, async (req, res, next) => {
  try {
    const payload = req.body || {}
    const doc = await Document.create(payload)
    res.status(201).json({ result: doc })
  } catch (err) { next(err) }
})

router.put('/documents/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const doc = await Document.findByIdAndUpdate(id, payload, { new: true })
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    res.json({ result: doc })
  } catch (err) { next(err) }
})

router.delete('/documents/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const doc = await Document.findByIdAndDelete(id)
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    res.json({ result: { id } })
  } catch (err) { next(err) }
})

export default router
