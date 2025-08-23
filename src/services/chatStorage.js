import Conversation from '../models/Conversation.js'
import Message from '../models/Message.js'

export async function createOrGetConversation(userId, conversationId) {
  if (conversationId) {
    const existing = await Conversation.findOne({ _id: conversationId, userId })
    if (existing) return existing
  }
  const convo = await Conversation.create({ userId })
  return convo
}

export async function saveMessage({ conversationId, userId, role, content, meta }) {
  return Message.create({ conversationId, userId, role, content, meta })
}

export async function saveAssistantMessage({ conversationId, userId, content, meta }) {
  return Message.create({ conversationId, userId, role: 'assistant', content, meta })
}

export async function listUserConversations(userId, { limit = 20, offset = 0 } = {}) {
  const convos = await Conversation.find({ userId })
    .sort({ updatedAt: -1 })
    .skip(offset)
    .limit(limit)
  return convos
}

export async function listConversationMessages(userId, conversationId, { limit = 50, offset = 0 } = {}) {
  // ensure ownership
  const convo = await Conversation.findOne({ _id: conversationId, userId })
  if (!convo) throw new Error('Conversation not found')
  const msgs = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .skip(offset)
    .limit(limit)
  return msgs
}

export async function setMessageFeedback(userId, messageId, liked) {
  const msg = await Message.findOne({ _id: messageId, userId })
  if (!msg) throw new Error('Message not found')
  msg.liked = liked
  await msg.save()
  return msg
}
