import { Router } from 'express'
import User from '../models/User.js'
import { signToken } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' })

    const exists = await User.findOne({ email })
    if (exists) return res.status(409).json({ error: 'email already registered' })

    const passwordHash = await User.hashPassword(password)
    const user = await User.create({ name, email, passwordHash })

    const token = signToken({ id: String(user._id) })
    res.cookie('token', `Bearer ${token}`, { httpOnly: true, sameSite: 'lax' })
    return res.json({ result: { id: String(user._id), email: user.email, name: user.name, token } })
  } catch (err) {
    return next(err)
  }
})

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' })

    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = await user.comparePassword(password)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    const token = signToken({ id: String(user._id) })
    res.cookie('token', `Bearer ${token}`, { httpOnly: true, sameSite: 'lax' })
    return res.json({ result: { id: String(user._id), email: user.email, name: user.name, token } })
  } catch (err) {
    return next(err)
  }
})

export default router
