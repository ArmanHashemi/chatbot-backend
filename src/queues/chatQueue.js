import BullMQPkg from 'bullmq'
import { createOrGetConversation, saveMessage, saveAssistantMessage } from '../services/chatStorage.js'
import { llmText } from '../services/llm.js'

const { Queue, Worker, QueueEvents } = BullMQPkg

export function initChatQueue({ connection, io }) {
  const chatQueueName = 'chat-jobs'
  const chatQueue = new Queue(chatQueueName, { connection })
  const chatQueueEvents = new QueueEvents(chatQueueName, { connection })

  const chatWorker = new Worker(
    chatQueueName,
    async (job) => {
      const { message, conversationId, clientId, userId } = job.data || {}

      // Ensure conversation exists
      const convo = await createOrGetConversation(userId, conversationId)

      // Save user's message
      const userMsgDoc = await saveMessage({
        conversationId: convo._id,
        userId,
        role: 'user',
        content: message,
      })

      // Call external LLM
      const reply = await llmText(message)

      // Save assistant message
      const assistantMsgDoc = await saveAssistantMessage({
        conversationId: convo._id,
        userId,
        content: reply,
      })

      // Emit result to client via socket
      if (clientId && io.sockets.sockets.get(clientId)) {
        io.to(clientId).emit('chat:response', {
          jobId: job.id,
          conversationId: String(convo._id),
          reply,
          userMessageId: String(userMsgDoc._id),
          assistantMessageId: String(assistantMsgDoc._id),
        })
      }

      return {
        conversationId: String(convo._id),
        reply,
        userMessageId: String(userMsgDoc._id),
        assistantMessageId: String(assistantMsgDoc._id),
      }
    },
    { connection, concurrency: 1 }
  )

  chatWorker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error('Job failed', job?.id, err?.message)
    const clientId = job?.data?.clientId
    if (clientId) {
      io.to(clientId).emit('chat:error', { jobId: job?.id, error: err?.message || 'Job failed' })
    }
  })

  chatQueueEvents.on('waiting', ({ jobId }) => {
    io.emit('chat:waiting', { jobId })
  })

  return { chatQueue, chatWorker, chatQueueEvents }
}

export default initChatQueue
