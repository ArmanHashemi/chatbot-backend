import BullMQPkg from 'bullmq'
import { createOrGetConversation, saveMessage, saveAssistantMessage } from '../services/chatStorage.js'
import { llmAssist } from '../services/llm.js'
import { listConversationMessages } from '../services/chatStorage.js'
import { logger } from '../services/logger.js'

const { Queue, Worker, QueueEvents } = BullMQPkg

export function initChatQueue({ connection, io }) {
  const chatQueueName = 'chat-jobs'
  const chatQueue = new Queue(chatQueueName, { connection })
  const chatQueueEvents = new QueueEvents(chatQueueName, { connection })
  logger.info('queue:init', { queue: chatQueueName })

  const chatWorker = new Worker(
    chatQueueName,
    async (job) => {
      const { message, conversationId, clientId, userId, action = 1, payload } = job.data || {}
      const log = logger.child({ jobId: job.id, userId, clientId })
      log.info('job:start', {
        conversationId,
        messageLen: typeof message === 'string' ? message.length : 0,
        action,
      })

      // Ensure conversation exists
      const convo = await createOrGetConversation(userId, conversationId)

      // Determine user-visible content to save
      const userContent = typeof message === 'string' && message.length > 0
        ? message
        : `[action:${Number(action)}] ${payload ? JSON.stringify(payload).slice(0, 500) : ''}`

      // Save user's message (even for non-1 actions so history is complete)
      const userMsgDoc = await saveMessage({
        conversationId: convo._id,
        userId,
        role: 'user',
        content: userContent,
      })

      // If this conversation has no title yet, set it from the first user message
      if (!convo.title || String(convo.title).trim().length === 0) {
        try {
          const raw = (typeof message === 'string' && message.trim().length > 0)
            ? message.trim()
            : `اکشن ${Number(action)}`
          const title = raw.length > 0 ? (raw.length > 40 ? raw.slice(0, 40) + '…' : raw) : 'گفتگو'
          convo.title = title
          await convo.save()
          log.info('job:convo_title_set', { conversationId: String(convo._id), title })
        } catch (e) {
          log.warn('job:convo_title_set_error', { error: e?.message })
        }
      }

      // Build history from previous messages in this conversation (excluding the one we just saved)
      const prevMsgs = await listConversationMessages(userId, String(convo._id))
      const history = (prevMsgs || [])
        .filter((m) => String(m._id) !== String(userMsgDoc._id))
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
          // Upstream expects assistant entries to include 'dislike' key (0 or 1)
          ...(m.role === 'assistant'
            ? { dislike: typeof m.liked === 'boolean' ? (m.liked === false ? 1 : 0) : 0 }
            : {}),
        }))
      log.info('job:history', { historyLen: history.length })

      // Call external LLM assist endpoint
      const userContentForLlm = (typeof message === 'string' && message.length > 0)
        ? message
        : `[action:${Number(action)}] payload=${payload ? JSON.stringify(payload) : '{}'}`
      const assistData = await llmAssist({
        action: Number(action) || 1,
        history,
        user: { role: 'user', content: userContentForLlm },
      })
      const reply = assistData?.response || ''
      const docs = Array.isArray(assistData?.docs) ? assistData.docs : []
      log.info('job:llm_reply', { replyLen: reply.length, docsLen: docs.length })

      // Save assistant message
      const assistantMsgDoc = await saveAssistantMessage({
        conversationId: convo._id,
        userId,
        content: reply,
        meta: { docs },
      })

      // Emit result to client via socket
      if (clientId && io.sockets.sockets.get(clientId)) {
        const payload = {
          jobId: job.id,
          conversationId: String(convo._id),
          reply,
          docs,
          userMessageId: String(userMsgDoc._id),
          assistantMessageId: String(assistantMsgDoc._id),
        }
        io.to(clientId).emit('chat:response', payload)
        log.info('job:emit_success', { to: clientId })
      }

      const result = {
        conversationId: String(convo._id),
        reply,
        docs,
        userMessageId: String(userMsgDoc._id),
        assistantMessageId: String(assistantMsgDoc._id),
      }
      log.info('job:complete', { conversationId: result.conversationId })
      return result
    },
    { connection, concurrency: 1 }
  )

  chatWorker.on('failed', (job, err) => {
    logger.error('job:failed', { jobId: job?.id, error: err?.message, stack: err?.stack })
    const clientId = job?.data?.clientId
    if (clientId) {
      io.to(clientId).emit('chat:error', { jobId: job?.id, error: err?.message || 'Job failed' })
    }
  })

  // Queue/Redis lifecycle events
  async function emitQueueStats() {
    try {
      const [waiting, delayed, active] = await Promise.all([
        chatQueue.getWaitingCount(),
        chatQueue.getDelayedCount(),
        chatQueue.getActiveCount(),
      ])
      io.emit('queue:stats', { waiting, delayed, active, length: waiting + delayed + active })
    } catch (e) {
      logger.warn('queue:stats_error', { error: e?.message })
    }
  }

  chatQueueEvents.on('waiting', ({ jobId }) => {
    logger.info('queue:waiting', { queue: chatQueueName, jobId })
    io.emit('chat:waiting', { jobId })
    emitQueueStats()
  })
  chatQueueEvents.on('active', ({ jobId, prev }) => {
    logger.info('queue:active', { queue: chatQueueName, jobId, prev })
    emitQueueStats()
  })
  chatQueueEvents.on('completed', ({ jobId, returnvalue }) => {
    logger.info('queue:completed', {
      queue: chatQueueName,
      jobId,
      returnKeys: returnvalue ? Object.keys(returnvalue) : [],
    })
    emitQueueStats()
  })
  chatQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error('queue:failed', { queue: chatQueueName, jobId, failedReason })
    emitQueueStats()
  })
  chatQueueEvents.on('stalled', ({ jobId }) => {
    logger.warn('queue:stalled', { queue: chatQueueName, jobId })
    emitQueueStats()
  })
  chatQueueEvents.on('progress', ({ jobId, data }) => {
    logger.info('queue:progress', { queue: chatQueueName, jobId, data })
  })
  chatQueueEvents.on('delayed', ({ jobId, delay }) => {
    logger.info('queue:delayed', { queue: chatQueueName, jobId, delay })
    emitQueueStats()
  })
  chatQueueEvents.on('drained', () => {
    logger.info('queue:drained', { queue: chatQueueName })
    emitQueueStats()
  })

  return { chatQueue, chatWorker, chatQueueEvents }
}

export default initChatQueue
