import mongoose from 'mongoose'
import crypto from 'crypto'

const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    default: 'Default API Key',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastUsedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: null, // null means never expires
  },
})

// Generate a new API key
apiKeySchema.statics.generateKey = function() {
  // Format: app-{random-32-chars}
  const randomBytes = crypto.randomBytes(24).toString('base64')
  // Make it URL-safe
  const urlSafeKey = randomBytes.replace(/[+/=]/g, (char) => {
    switch (char) {
      case '+': return '-'
      case '/': return '_'
      case '=': return ''
      default: return char
    }
  })
  return `app-${urlSafeKey}`
}

// Validate API key and get user
apiKeySchema.statics.validateAndGetUser = async function(apiKey) {
  const keyDoc = await this.findOne({ 
    key: apiKey, 
    isActive: true 
  }).populate('userId')

  if (!keyDoc) {
    return null
  }

  // Check if expired
  if (keyDoc.expiresAt && keyDoc.expiresAt < new Date()) {
    return null
  }

  // Update last used timestamp
  keyDoc.lastUsedAt = new Date()
  await keyDoc.save()

  return keyDoc.userId
}

export default mongoose.model('ApiKey', apiKeySchema)
