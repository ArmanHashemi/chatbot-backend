import { Router } from 'express'
import ApiKey from '../models/ApiKey.js'
import { authRequired } from '../middleware/auth.js'
import { logger as baseLogger } from '../services/logger.js'

const router = Router()
const logger = baseLogger.child({ route: 'apiKeys' })

/**
 * GET /api/keys
 * Get all API keys for the authenticated user
 */
router.get('/', authRequired, async (req, res) => {
  try {
    const keys = await ApiKey.find({ 
      userId: req.user.id 
    }).select('-key') // Don't return the actual key in list
    
    logger.info('keys:list', { userId: req.user.id, count: keys.length })
    res.json({ keys })
  } catch (error) {
    logger.error('keys:list:error', { error: error.message })
    res.status(500).json({ error: 'Failed to fetch API keys' })
  }
})

/**
 * POST /api/keys
 * Create a new API key
 */
router.post('/', authRequired, async (req, res) => {
  try {
    const { name = 'Default API Key', expiresIn = null } = req.body
    
    // Generate new key
    const apiKey = ApiKey.generateKey()
    
    // Calculate expiration if provided (in days)
    let expiresAt = null
    if (expiresIn && Number(expiresIn) > 0) {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + Number(expiresIn))
    }
    
    // Create key document
    const keyDoc = await ApiKey.create({
      userId: req.user.id,
      key: apiKey,
      name,
      expiresAt
    })
    
    logger.info('keys:create', { 
      userId: req.user.id, 
      keyId: keyDoc._id,
      name,
      expiresAt 
    })
    
    // Return the key only once during creation
    res.json({
      id: keyDoc._id,
      key: apiKey,
      name: keyDoc.name,
      createdAt: keyDoc.createdAt,
      expiresAt: keyDoc.expiresAt,
      message: 'Save this key securely. It will not be shown again.'
    })
  } catch (error) {
    logger.error('keys:create:error', { error: error.message })
    res.status(500).json({ error: 'Failed to create API key' })
  }
})

/**
 * DELETE /api/keys/:id
 * Delete/revoke an API key
 */
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const result = await ApiKey.deleteOne({
      _id: req.params.id,
      userId: req.user.id
    })
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'API key not found' })
    }
    
    logger.info('keys:delete', { 
      userId: req.user.id, 
      keyId: req.params.id 
    })
    
    res.json({ message: 'API key deleted successfully' })
  } catch (error) {
    logger.error('keys:delete:error', { error: error.message })
    res.status(500).json({ error: 'Failed to delete API key' })
  }
})

/**
 * PATCH /api/keys/:id/toggle
 * Toggle API key active status
 */
router.patch('/:id/toggle', authRequired, async (req, res) => {
  try {
    const key = await ApiKey.findOne({
      _id: req.params.id,
      userId: req.user.id
    })
    
    if (!key) {
      return res.status(404).json({ error: 'API key not found' })
    }
    
    key.isActive = !key.isActive
    await key.save()
    
    logger.info('keys:toggle', { 
      userId: req.user.id, 
      keyId: req.params.id,
      isActive: key.isActive 
    })
    
    res.json({ 
      id: key._id,
      name: key.name,
      isActive: key.isActive 
    })
  } catch (error) {
    logger.error('keys:toggle:error', { error: error.message })
    res.status(500).json({ error: 'Failed to toggle API key' })
  }
})

export default router
