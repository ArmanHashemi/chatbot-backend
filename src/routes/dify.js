import { Router } from 'express'
import { authenticateDifyAPI } from '../middleware/difyAuth.js'
import { handleDifyBlockingRequest, handleDifyStreamingRequest } from '../services/difyAdapter.js'
import { logger as baseLogger } from '../services/logger.js'

const router = Router()
const logger = baseLogger.child({ route: 'dify' })

/**
 * POST /v1/chat-messages
 * Dify-compatible chat endpoint
 */
router.post('/v1/chat-messages', authenticateDifyAPI, async (req, res) => {
  const log = logger.child({ 
    endpoint: 'chat-messages',
    userId: req.difyUser ? String(req.difyUser._id) : 'unknown'
  })

  try {
    const { query, inputs = {}, user, conversation_id, response_mode = 'blocking' } = req.body

    // Validate required fields
    if (!query) {
      log.warn('request:missing_query')
      return res.status(400).json({
        status: 400,
        code: 'invalid_param',
        message: 'Missing required parameter: query'
      })
    }

    if (inputs === null || inputs === undefined) {
      log.warn('request:missing_inputs')
      return res.status(400).json({
        status: 400,
        code: 'invalid_param',
        message: 'Missing required parameter: inputs'
      })
    }

    log.info('request:received', {
      queryLen: query.length,
      conversationId: conversation_id,
      responseMode: response_mode
    })

    // Handle based on response mode
    if (response_mode === 'streaming') {
      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable Nginx buffering
      })

      try {
        // Stream events
        for await (const event of handleDifyStreamingRequest(req.difyUser, req.body)) {
          // Format as SSE
          const data = JSON.stringify(event)
          res.write(`data: ${data}\n\n`)
          
          // Check if client is still connected
          if (res.destroyed) {
            log.info('stream:client_disconnected')
            break
          }
        }

        // Send final newline and end response
        res.write('\n')
        res.end()
        
        log.info('stream:complete')
      } catch (streamError) {
        log.error('stream:error', { error: streamError.message })
        
        // Send error event if still connected
        if (!res.destroyed) {
          const errorEvent = {
            event: 'error',
            status: streamError.status || 500,
            code: streamError.code || 'internal_server_error',
            message: streamError.message || 'Streaming failed'
          }
          res.write(`data: ${JSON.stringify(errorEvent)}\n\n`)
          res.end()
        }
      }
    } else {
      // Blocking mode
      try {
        const response = await handleDifyBlockingRequest(req.difyUser, req.body)
        
        log.info('blocking:success', { 
          conversationId: response.conversation_id,
          answerLen: response.answer?.length || 0
        })
        
        return res.json(response)
      } catch (blockingError) {
        log.error('blocking:error', { 
          error: blockingError.message,
          code: blockingError.code 
        })
        
        const status = blockingError.status || 500
        return res.status(status).json({
          status,
          code: blockingError.code || 'internal_server_error',
          message: blockingError.message || 'Request failed'
        })
      }
    }
  } catch (error) {
    log.error('request:unexpected_error', { 
      error: error.message,
      stack: error.stack 
    })
    
    return res.status(500).json({
      status: 500,
      code: 'internal_server_error',
      message: 'An unexpected error occurred'
    })
  }
})

/**
 * GET /v1/conversations/:id/messages
 * Get conversation messages (optional endpoint for testing)
 */
router.get('/v1/conversations/:id/messages', authenticateDifyAPI, async (req, res) => {
  const log = logger.child({ 
    endpoint: 'get-messages',
    conversationId: req.params.id
  })

  try {
    const { listConversationMessages } = await import('../services/chatStorage.js')
    const messages = await listConversationMessages(String(req.difyUser._id), req.params.id)
    
    if (!messages) {
      return res.status(404).json({
        status: 404,
        code: 'conversation_does_not_exist',
        message: 'Conversation not found'
      })
    }

    const formattedMessages = messages.map(msg => ({
      id: String(msg._id),
      conversation_id: String(msg.conversationId),
      role: msg.role,
      content: msg.content,
      created_at: Math.floor(new Date(msg.createdAt).getTime() / 1000)
    }))

    log.info('messages:retrieved', { count: formattedMessages.length })
    return res.json({ data: formattedMessages })
  } catch (error) {
    log.error('messages:error', { error: error.message })
    return res.status(500).json({
      status: 500,
      code: 'internal_server_error', 
      message: 'Failed to retrieve messages'
    })
  }
})

export default router
