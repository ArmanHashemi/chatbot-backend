import crypto from 'crypto'
import { llmAssist, llmStreamAssist } from './llm.js'
import { logger as baseLogger } from './logger.js'
import { createOrGetConversation, listConversationMessages, saveMessage, saveAssistantMessage } from './chatStorage.js'
import { createTrace, createSpan, createGeneration, finalizeTrace } from './langfuseIntegration.js'

const logger = baseLogger.child({ service: 'difyAdapter' })

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return crypto.randomUUID()
}

/**
 * Convert our internal docs format to Dify retriever_resources format
 */
function convertDocsToRetrieverResources(docs) {
  if (!Array.isArray(docs)) return []
  
  return docs.map((doc, index) => ({
    position: index + 1,
    dataset_id: doc.dataset_id || generateUUID(),
    dataset_name: doc.dataset_name || 'Knowledge Base',
    document_id: doc.document_id || generateUUID(),
    document_name: doc.document_name || doc.title || `Document ${index + 1}`,
    segment_id: doc.segment_id || generateUUID(),
    score: typeof doc.score === 'number' ? doc.score : 0.85,
    content: doc.content || doc.text || ''
  }))
}

/**
 * Transform Dify request to our internal assist format
 */
export function transformDifyRequest(difyPayload) {
  const { query, inputs = {}, user, conversation_id, response_mode = 'blocking' } = difyPayload
  
  return {
    message: query,
    userId: user,
    conversationId: conversation_id,
    inputs,
    responseMode: response_mode,
    // Default to action 1 (chat) unless specified in inputs
    action: inputs.action || 1,
    payload: inputs.payload || null,
    think: inputs.think || 0
  }
}

/**
 * Transform our internal response to Dify response format
 */
export function transformToDifyResponse(internalResponse, responseMode = 'blocking') {
  const {
    conversationId,
    reply,
    docs,
    userMessageId,
    assistantMessageId,
    taskId = generateUUID()
  } = internalResponse

  const timestamp = Math.floor(Date.now() / 1000)
  const metadata = {
    retriever_resources: convertDocsToRetrieverResources(docs)
  }

  if (responseMode === 'blocking') {
    return {
      event: 'message',
      task_id: taskId,
      id: assistantMessageId || generateUUID(),
      message_id: assistantMessageId || generateUUID(),
      conversation_id: conversationId,
      mode: 'chat',
      answer: reply || '',
      metadata,
      created_at: timestamp
    }
  }

  // For streaming, we'll return event generators
  // This is a placeholder that will be implemented when streaming API is ready
  return {
    initial: {
      event: 'message',
      task_id: taskId,
      message_id: assistantMessageId || generateUUID(),
      conversation_id: conversationId,
      answer: reply || '',
      created_at: timestamp
    },
    final: {
      event: 'message_end',
      task_id: taskId,
      id: assistantMessageId || generateUUID(),
      message_id: assistantMessageId || generateUUID(),
      conversation_id: conversationId,
      metadata
    }
  }
}

/**
 * Handle Dify chat request in blocking mode
 */
export async function handleDifyBlockingRequest(user, payload) {
  const log = baseLogger.child({ service: 'difyAdapter', mode: 'blocking', userId: String(user._id) })
  
  // Create Langfuse trace
  const trace = createTrace({
    userId: user.email, // Use email as user ID
    sessionId: payload.conversation_id || 'no-conversation',
    query: payload.query,
    metadata: {
      response_mode: 'blocking',
      user_id: String(user._id),
      user_email: user.email
    }
  })
  
  try {
    const { query, inputs = {}, conversation_id, response_mode } = payload

    // Validate required parameters
    if (!query) {
      throw {
        status: 400,
        code: 'invalid_param',
        message: 'Missing required parameter: query'
      }
    }

    // Create or get conversation
    const conversation = await createOrGetConversation(String(user._id), conversation_id)
    const conversationId = String(conversation._id)
    
    // Save user message
    const userMessage = await saveMessage({
      conversationId,
      userId: String(user._id),
      role: 'user',
      content: query
    })

    // Build history
    const prevMessages = await listConversationMessages(String(user._id), conversationId)
    const history = prevMessages
      .filter(m => String(m._id) !== String(userMessage._id))
      .slice(-10) // Limit history to last 10 messages
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
        ...(m.role === 'assistant' ? { dislike: 0 } : {})
      }))

    log.info('request:prepare', { 
      conversationId, 
      historyLen: history.length,
      queryLen: query.length 
    })

    // Log context fetching (if docs are provided)
    if (inputs.fdoc || inputs.sdoc) {
      createSpan(trace, {
        name: 'fetch_context_via_primary_search',
        input: { query },
        output: { 
          context: [
            ...(inputs.fdoc ? [inputs.fdoc] : []),
            ...(inputs.sdoc ? [inputs.sdoc] : [])
          ] 
        }
      })
    }

    // Log prompt preparation
    createSpan(trace, {
      name: 'prepare_for_generation',
      input: { 
        user_query: query, 
        history: history.map(h => h.content),
        context: inputs.fdoc || null
      },
      output: { 
        prompt_template: 'default_chat_template',
        system_prompt: 'You are a helpful assistant'
      }
    })

    // Call LLM assist
    const startTime = new Date()
    const assistResponse = await llmAssist({
      action: inputs.action || 1,
      history,
      user: { role: 'user', content: query },
      fdoc: inputs.fdoc || '',
      sdoc: inputs.sdoc || '',
      query: inputs.query || '',
      think: inputs.think || 0
    })
    const endTime = new Date()

    const reply = assistResponse?.response || ''
    const docs = Array.isArray(assistResponse?.docs) ? assistResponse.docs : []

    // Log generation
    createGeneration(trace, {
      model: 'gpt-4', // or get from config
      startTime,
      endTime,
      input: query,
      output: reply,
      modelParameters: {
        temperature: 0.7,
        max_tokens: 1000
      },
      usage: {
        input_tokens: Math.ceil(query.length / 4), // Approximate
        output_tokens: Math.ceil(reply.length / 4), // Approximate
        total_tokens: Math.ceil((query.length + reply.length) / 4)
      }
    })

    // Save assistant response
    const assistantMessage = await saveAssistantMessage({
      conversationId,
      userId: String(user._id),
      content: reply,
      meta: { docs }
    })

    // Update conversation title if needed
    if (!conversation.title || conversation.title.trim() === '') {
      conversation.title = query.slice(0, 40) + (query.length > 40 ? '...' : '')
      await conversation.save()
    }

    log.info('request:complete', { 
      conversationId,
      replyLen: reply.length,
      docsCount: docs.length 
    })

    // Finalize trace
    finalizeTrace(trace, { 
      response: reply,
      docs_count: docs.length
    })

    // Return Dify-formatted response
    return transformToDifyResponse({
      conversationId,
      reply,
      docs,
      userMessageId: String(userMessage._id),
      assistantMessageId: String(assistantMessage._id),
      taskId: generateUUID()
    }, 'blocking')
  } catch (error) {
    log.error('request:error', { error: error.message, stack: error.stack })
    
    // If error has status and code, it's a known error
    if (error.status && error.code) {
      throw error
    }
    
    // Otherwise, internal server error
    throw {
      status: 500,
      code: 'internal_server_error',
      message: 'Failed to process chat request'
    }
  }
}

/**
 * Handle Dify chat request in streaming mode
 */
export async function* handleDifyStreamingRequest(user, payload) {
  const log = baseLogger.child({ service: 'difyAdapter', mode: 'streaming', userId: String(user._id) })
  
  // Create Langfuse trace for streaming
  const trace = createTrace({
    userId: user.email, // Use email as user ID
    sessionId: payload.conversation_id || 'no-conversation',
    query: payload.query,
    metadata: {
      response_mode: 'streaming',
      user_id: String(user._id),
      user_email: user.email
    }
  })
  
  try {
    const { query, inputs = {}, conversation_id } = payload

    // Validate required parameters
    if (!query) {
      throw {
        status: 400,
        code: 'invalid_param',
        message: 'Missing required parameter: query'
      }
    }

    const taskId = generateUUID()
    const messageId = generateUUID()
    const timestamp = Math.floor(Date.now() / 1000)
    
    // Create or get conversation
    const conversation = await createOrGetConversation(String(user._id), conversation_id)
    const conversationId = String(conversation._id)
    
    // Save user message
    const userMessage = await saveMessage({
      conversationId,
      userId: String(user._id),
      role: 'user',
      content: query
    })

    // Build history
    const prevMessages = await listConversationMessages(String(user._id), conversationId)
    const history = prevMessages
      .filter(m => String(m._id) !== String(userMessage._id))
      .slice(-10)
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
        ...(m.role === 'assistant' ? { dislike: 0 } : {})
      }))

    log.info('stream:start', { 
      conversationId, 
      queryLen: query.length,
      historyLen: history.length 
    })
    
    // Log context fetching (if docs are provided)
    if (inputs.fdoc || inputs.sdoc) {
      createSpan(trace, {
        name: 'fetch_context_via_primary_search',
        input: { query },
        output: { 
          context: [
            ...(inputs.fdoc ? [inputs.fdoc] : []),
            ...(inputs.sdoc ? [inputs.sdoc] : [])
          ] 
        }
      })
    }
    
    // Log prompt preparation
    createSpan(trace, {
      name: 'prepare_for_generation',
      input: { 
        user_query: query, 
        history: history.map(h => h.content),
        context: inputs.fdoc || null
      },
      output: { 
        prompt_template: 'default_chat_template',
        system_prompt: 'You are a helpful assistant'
      }
    })

    // Update conversation title if needed
    if (!conversation.title || conversation.title.trim() === '') {
      conversation.title = query.slice(0, 40) + (query.length > 40 ? '...' : '')
      await conversation.save()
    }

    // Start streaming from LLM
    const streamGenerator = llmStreamAssist({
      action: inputs.action || 1,
      history,
      user: { role: 'user', content: query },
      fdoc: inputs.fdoc || '',
      sdoc: inputs.sdoc || '',
      query: inputs.query || '',
      think: inputs.think || 0
    })

    let fullAnswer = ''
    let totalTokens = 0
    let docs = []
    const startTime = new Date()

    // Stream chunks to client
    for await (const chunk of streamGenerator) {
      if (chunk.type === 'chunk') {
        // Send incremental text
        fullAnswer = chunk.fullText
        yield {
          event: 'message',
          task_id: taskId,
          message_id: messageId,
          conversation_id: conversationId,
          answer: chunk.text,
          created_at: timestamp
        }
      } else if (chunk.type === 'finished') {
        fullAnswer = chunk.text
        totalTokens = chunk.totalTokens
        const endTime = new Date()
        
        // Log generation
        createGeneration(trace, {
          model: 'gpt-4', // or get from config
          startTime,
          endTime,
          input: query,
          output: fullAnswer,
          modelParameters: {
            temperature: 0.7,
            max_tokens: 1000,
            streaming: true
          },
          usage: {
            total_tokens: totalTokens,
            input_tokens: Math.ceil(query.length / 4), // Approximate
            output_tokens: Math.ceil(fullAnswer.length / 4) // Approximate
          }
        })
        
        // Save assistant message
        const assistantMessage = await saveAssistantMessage({
          conversationId,
          userId: String(user._id),
          content: fullAnswer,
          meta: { docs, totalTokens }
        })

        // Send final event with metadata
        yield {
          event: 'message_end',
          task_id: taskId,
          id: String(assistantMessage._id),
          message_id: String(assistantMessage._id),
          conversation_id: conversationId,
          metadata: {
            retriever_resources: convertDocsToRetrieverResources(docs),
            usage: {
              total_tokens: totalTokens
            }
          }
        }
        
        // Finalize Langfuse trace
        finalizeTrace(trace, { 
          response: fullAnswer,
          total_tokens: totalTokens,
          streaming: true
        })
        
        log.info('stream:complete', { 
          conversationId,
          totalTokens,
          answerLen: fullAnswer.length 
        })
      }
    }
  } catch (error) {
    log.error('stream:error', { error: error.message, stack: error.stack })
    
    // Yield error event
    yield {
      event: 'error',
      status: error.status || 500,
      code: error.code || 'internal_server_error',
      message: error.message || 'Streaming failed'
    }
  }
}
