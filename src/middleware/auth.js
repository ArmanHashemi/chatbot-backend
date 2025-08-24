import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export function signToken(payload, options = {}) {
  const secret = process.env.JWT_SECRET || 'dev_secret_change_me'
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  return jwt.sign(payload, secret, { expiresIn, ...options })
}

export async function authRequired(req, res, next) {
  try {
    const header = req.headers['authorization'] || req.cookies?.token
    if (!header) return res.status(401).json({ error: 'Unauthorized' })

    const token = header.startsWith('Bearer ') ? header.slice(7) : header
    const secret = process.env.JWT_SECRET || 'dev_secret_change_me'
    const decoded = jwt.verify(token, secret)

    const user = await User.findById(decoded.id)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    req.user = { id: String(user._id), email: user.email, name: user.name, isAdmin: !!user.isAdmin }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

export function adminRequired(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}
