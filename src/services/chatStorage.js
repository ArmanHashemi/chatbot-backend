import Conversation from '../models/Conversation.js'
import Message from '../models/Message.js'
import mongoose from 'mongoose'
import { logger } from './logger.js'
import { analyzeSentiment } from './sentiment.js'

export async function createOrGetConversation(userId, conversationId) {
  const log = logger.child({ svc: 'chatStorage' })
  log.info('db:convo:get_or_create:start', { userId, conversationId })
  if (conversationId && mongoose.isValidObjectId(conversationId)) {
    const existing = await Conversation.findOne({ _id: conversationId, userId })
    if (existing) {
      log.info('db:convo:found', { id: String(existing._id) })
      return existing
    }
  }
  const convo = await Conversation.create({ userId })
  log.info('db:convo:created', { id: String(convo._id) })
  return convo
}

export async function saveMessage({ conversationId, userId, role, content, meta }) {
  const log = logger.child({ svc: 'chatStorage' })
  log.info('db:message:create:start', {
    conversationId,
    userId,
    role,
    contentLen: typeof content === 'string' ? content.length : 0,
    hasMeta: !!meta,
  })
  let sentiment = null
  let sentimentScore = null
  if (role === 'user') {
    try {
      const res = analyzeSentiment(content)
      sentiment = res.label
      sentimentScore = res.score
    } catch {}
  }
  const doc = await Message.create({ conversationId, userId, role, content, meta, sentiment, sentimentScore })
  log.info('db:message:created', { id: String(doc._id) })
  // Update conversation metadata
  try {
    const convo = await Conversation.findOne({ _id: conversationId, userId })
    if (convo) {
      // Set title from first user message if missing
      if ((!convo.title || String(convo.title).trim().length === 0) && role === 'user') {
        const raw = typeof content === 'string' ? content.trim() : ''
        convo.title = raw.length > 0 ? (raw.length > 40 ? raw.slice(0, 40) + '…' : raw) : 'گفتگو'
      }
      convo.meta = { ...(convo.meta || {}), lastMessage: content }
      await convo.save()
      log.info('db:convo:meta_updated', { id: String(convo._id) })
    }
  } catch (e) {
    log.warn('db:convo:meta_update_error', { error: e?.message })
  }
  return doc
}

export async function saveAssistantMessage({ conversationId, userId, content, meta }) {
  const log = logger.child({ svc: 'chatStorage' })
  log.info('db:assistant:create:start', {
    conversationId,
    userId,
    contentLen: typeof content === 'string' ? content.length : 0,
    hasMeta: !!meta,
    docsLen: Array.isArray(meta?.docs) ? meta.docs.length : undefined,
  })
  const doc = await Message.create({ conversationId, userId, role: 'assistant', content, meta })
  log.info('db:assistant:created', { id: String(doc._id) })
  // Update conversation last message preview
  try {
    const convo = await Conversation.findOne({ _id: conversationId, userId })
    if (convo) {
      convo.meta = { ...(convo.meta || {}), lastMessage: content }
      await convo.save()
      log.info('db:convo:meta_updated', { id: String(convo._id) })
    }
  } catch (e) {
    log.warn('db:convo:meta_update_error', { error: e?.message })
  }
  return doc
}

export async function listUserConversations(userId, { limit = 20, offset = 0 } = {}) {
  const log = logger.child({ svc: 'chatStorage' })
  log.info('db:convo:list:start', { userId, limit, offset })
  const convos = await Conversation.find({ userId, deletedAt: null })
    .sort({ updatedAt: -1 })
    .skip(offset)
    .limit(limit)
  log.info('db:convo:list:done', { count: convos?.length || 0 })
  return convos
}

export async function listConversationMessages(userId, conversationId, { limit = 50, offset = 0 } = {}) {
  // ensure ownership
  const log = logger.child({ svc: 'chatStorage' })
  log.info('db:messages:list:start', { userId, conversationId, limit, offset })
  if (!mongoose.isValidObjectId(conversationId)) {
    log.warn('db:messages:list:invalid_id', { conversationId })
    return []
  }
  const convo = await Conversation.findOne({ _id: conversationId, userId, deletedAt: null })
  if (!convo) throw new Error('Conversation not found')
  const msgs = await Message.find({ conversationId, deletedAt: null })
    .sort({ createdAt: 1 })
    .skip(offset)
    .limit(limit)
  log.info('db:messages:list:done', { count: msgs?.length || 0 })
  return msgs
}

export async function setMessageFeedback(userId, messageId, liked) {
  const log = logger.child({ svc: 'chatStorage' })
  log.info('db:message:feedback:start', { userId, messageId, liked })
  if (!mongoose.isValidObjectId(messageId)) {
    throw new Error('Message not found')
  }
  const msg = await Message.findOne({ _id: messageId, userId })
  if (!msg) throw new Error('Message not found')
  msg.liked = liked
  await msg.save()
  log.info('db:message:feedback:done', { id: String(msg._id), liked })
  return msg
}

export async function deleteConversation(userId, conversationId) {
  const log = logger.child({ svc: 'chatStorage' })
  log.info('db:convo:delete:start', { userId, conversationId })
  if (!mongoose.isValidObjectId(conversationId)) {
    log.warn('db:convo:delete:invalid_id', { conversationId })
    return { ok: true }
  }
  const convo = await Conversation.findOne({ _id: conversationId, userId, deletedAt: null })
  if (!convo) throw new Error('Conversation not found')
  const now = new Date()
  convo.deletedAt = now
  await convo.save()
  // Soft delete messages
  await Message.updateMany({ conversationId, userId, deletedAt: null }, { $set: { deletedAt: now } })
  log.info('db:convo:delete:done', { conversationId })
  return { ok: true }
}
