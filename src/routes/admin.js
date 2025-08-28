import { Router } from 'express'
import { authRequired, adminRequired } from '../middleware/auth.js'
import User from '../models/User.js'
import Document from '../models/Document.js'
import Conversation from '../models/Conversation.js'
import Message from '../models/Message.js'
import FAQ from '../models/FAQ.js'

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

// Conversations listing (admin)
router.get('/conversations', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { userId, limit = 20, offset = 0 } = req.query || {}
    const q = { deletedAt: null }
    if (userId) q.userId = userId
    const convos = await Conversation.find(q)
      .sort({ updatedAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
    res.json({ result: convos })
  } catch (err) { next(err) }
})

// Messages listing (admin) with optional filters
router.get('/messages', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { userId, conversationId, from, to, role, limit = 100, offset = 0 } = req.query || {}
    const q = { deletedAt: null }
    if (userId) q.userId = userId
    if (conversationId) q.conversationId = conversationId
    if (role) q.role = role
    if (from || to) {
      q.createdAt = {}
      if (from) q.createdAt.$gte = new Date(from)
      if (to) q.createdAt.$lte = new Date(to)
    }
    const msgs = await Message.find(q)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
    res.json({ result: msgs })
  } catch (err) { next(err) }
})

// Feedback metrics
router.get('/metrics/feedback', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { from, to, groupBy = 'day' } = req.query || {}
    const match = { deletedAt: null, role: 'assistant' }
    if (from || to) {
      match.createdAt = {}
      if (from) match.createdAt.$gte = new Date(from)
      if (to) match.createdAt.$lte = new Date(to)
    }
    const dateFmt = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d'
    const agg = await Message.aggregate([
      { $match: match },
      { $project: { liked: 1, createdAt: 1, day: { $dateToString: { format: dateFmt, date: '$createdAt' } } } },
      { $group: {
        _id: '$day',
        likes: { $sum: { $cond: [{ $eq: ['$liked', true] }, 1, 0] } },
        dislikes: { $sum: { $cond: [{ $eq: ['$liked', false] }, 1, 0] } },
        total: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ])
    res.json({ result: agg.map(x => ({ period: x._id, likes: x.likes, dislikes: x.dislikes, total: x.total })) })
  } catch (err) { next(err) }
})

// Sentiment metrics (user messages)
router.get('/metrics/sentiment', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { from, to, groupBy = 'day' } = req.query || {}
    const match = { deletedAt: null, role: 'user' }
    if (from || to) {
      match.createdAt = {}
      if (from) match.createdAt.$gte = new Date(from)
      if (to) match.createdAt.$lte = new Date(to)
    }
    const dateFmt = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d'
    const agg = await Message.aggregate([
      { $match: match },
      { $project: { sentiment: 1, createdAt: 1, day: { $dateToString: { format: dateFmt, date: '$createdAt' } } } },
      { $group: {
        _id: '$day',
        positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'positive'] }, 1, 0] } },
        neutral: { $sum: { $cond: [{ $eq: ['$sentiment', 'neutral'] }, 1, 0] } },
        negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'negative'] }, 1, 0] } },
        total: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ])
    res.json({ result: agg.map(x => ({ period: x._id, positive: x.positive, neutral: x.neutral, negative: x.negative, total: x.total })) })
  } catch (err) { next(err) }
})

// FAQ CRUD
router.get('/faqs', authRequired, adminRequired, async (_req, res, next) => {
  try {
    const rows = await FAQ.find().sort({ order: 1, createdAt: -1 })
    res.json({ result: rows })
  } catch (err) { next(err) }
})

router.post('/faqs', authRequired, adminRequired, async (req, res, next) => {
  try {
    const payload = req.body || {}
    const row = await FAQ.create(payload)
    res.status(201).json({ result: row })
  } catch (err) { next(err) }
})

router.put('/faqs/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const payload = req.body || {}
    const row = await FAQ.findByIdAndUpdate(id, payload, { new: true })
    if (!row) return res.status(404).json({ error: 'FAQ not found' })
    res.json({ result: row })
  } catch (err) { next(err) }
})

router.delete('/faqs/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const { id } = req.params
    const row = await FAQ.findByIdAndDelete(id)
    if (!row) return res.status(404).json({ error: 'FAQ not found' })
    res.json({ result: { id } })
  } catch (err) { next(err) }
})
