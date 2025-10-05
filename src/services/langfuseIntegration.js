/**
 * Langfuse Integration Service
 * This service provides observability for the chatbot using Langfuse
 */

import { Langfuse } from 'langfuse'
import { logger as baseLogger } from './logger.js'

const logger = baseLogger.child({ service: 'langfuse' })

// Initialize Langfuse client
let langfuseClient = null

/**
 * Initialize Langfuse client
 * @returns {Langfuse|null} Langfuse client instance or null if disabled
 */
export function initLangfuse() {
  // Check if Langfuse is enabled
  const isEnabled = process.env.LANGFUSE_ENABLED === 'true'
  
  if (!isEnabled) {
    logger.info('langfuse:disabled', { reason: 'LANGFUSE_ENABLED is not true' })
    return null
  }

  // Check required environment variables
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  const baseUrl = process.env.LANGFUSE_HOST || 'http://localhost:3000'

  if (!publicKey || !secretKey) {
    logger.warn('langfuse:missing_keys', { 
      hasPublicKey: !!publicKey, 
      hasSecretKey: !!secretKey 
    })
    return null
  }

  try {
    langfuseClient = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 1, // Flush immediately in development
      flushInterval: 10000, // Flush every 10 seconds
    })

    logger.info('langfuse:initialized', { baseUrl })
    return langfuseClient
  } catch (error) {
    logger.error('langfuse:init_error', { error: error.message })
    return null
  }
}

/**
 * Create a trace for user query processing
 * @param {Object} params - Trace parameters
 * @param {string} params.userId - User email or ID
 * @param {string} params.sessionId - Conversation ID
 * @param {string} params.query - User query
 * @param {Object} params.metadata - Additional metadata
 * @returns {Object|null} Trace object or null if Langfuse is disabled
 */
export function createTrace({ userId, sessionId, query, metadata = {} }) {
  if (!langfuseClient) return null

  try {
    const trace = langfuseClient.trace({
      name: 'process_user_query',
      userId, // Using email as userId
      sessionId,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      },
      input: { user_query: query },
      tags: metadata.tags || []
    })

    logger.debug('langfuse:trace_created', { 
      traceId: trace.id, 
      userId, 
      sessionId 
    })

    return trace
  } catch (error) {
    logger.error('langfuse:trace_error', { error: error.message })
    return null
  }
}

/**
 * Create a span observation
 * @param {Object} trace - Parent trace object
 * @param {Object} params - Span parameters
 * @returns {Object|null} Span object or null
 */
export function createSpan(trace, params) {
  if (!trace) return null

  try {
    const span = trace.span({
      name: params.name,
      startTime: params.startTime || new Date(),
      endTime: params.endTime,
      input: params.input || {},
      output: params.output || {},
      level: params.level || 'DEFAULT',
      statusMessage: params.statusMessage,
      metadata: params.metadata || {}
    })

    logger.debug('langfuse:span_created', { 
      spanName: params.name,
      traceId: trace.id 
    })

    return span
  } catch (error) {
    logger.error('langfuse:span_error', { error: error.message })
    return null
  }
}

/**
 * Create a generation observation for LLM calls
 * @param {Object} trace - Parent trace object
 * @param {Object} params - Generation parameters
 * @returns {Object|null} Generation object or null
 */
export function createGeneration(trace, params) {
  if (!trace) return null

  try {
    const generation = trace.generation({
      name: 'generation',
      startTime: params.startTime || new Date(),
      endTime: params.endTime,
      model: params.model || 'unknown',
      modelParameters: params.modelParameters || {},
      input: params.input,
      output: params.output,
      usage: params.usage || {},
      level: params.level || 'DEFAULT',
      statusMessage: params.statusMessage,
      metadata: params.metadata || {}
    })

    logger.debug('langfuse:generation_created', { 
      model: params.model,
      traceId: trace.id 
    })

    return generation
  } catch (error) {
    logger.error('langfuse:generation_error', { error: error.message })
    return null
  }
}

/**
 * Update trace with final output
 * @param {Object} trace - Trace object to update
 * @param {Object} output - Final output
 */
export function finalizeTrace(trace, output) {
  if (!trace) return

  try {
    trace.update({
      output,
      endTime: new Date()
    })

    logger.debug('langfuse:trace_finalized', { 
      traceId: trace.id 
    })
  } catch (error) {
    logger.error('langfuse:finalize_error', { error: error.message })
  }
}

/**
 * Flush all pending events to Langfuse
 */
export async function flushLangfuse() {
  if (!langfuseClient) return

  try {
    await langfuseClient.flush()
    logger.debug('langfuse:flushed')
  } catch (error) {
    logger.error('langfuse:flush_error', { error: error.message })
  }
}

/**
 * Shutdown Langfuse client gracefully
 */
export async function shutdownLangfuse() {
  if (!langfuseClient) return

  try {
    await langfuseClient.shutdown()
    logger.info('langfuse:shutdown')
  } catch (error) {
    logger.error('langfuse:shutdown_error', { error: error.message })
  }
}

// Initialize on module load
initLangfuse()

// Graceful shutdown
process.on('SIGINT', async () => {
  await shutdownLangfuse()
})

process.on('SIGTERM', async () => {
  await shutdownLangfuse()
})

/**
 * Example usage in difyAdapter.js:
 * 
 * import { createTrace, createSpan, createGeneration, finalizeTrace } from './langfuseIntegration.js'
 * 
 * export async function handleDifyBlockingRequest(user, payload) {
 *   // Create main trace
 *   const trace = createTrace({
 *     userId: user.email,
 *     sessionId: payload.conversation_id,
 *     query: payload.query,
 *     metadata: { response_mode: 'blocking' }
 *   })
 * 
 *   // Create span for context fetching
 *   const contextSpan = createSpan(trace, {
 *     name: 'fetch_context_via_primary_search',
 *     input: { query: payload.query },
 *     output: { context: documents }
 *   })
 * 
 *   // Create generation observation
 *   const generation = createGeneration(trace, {
 *     model: 'gpt-4',
 *     input: prompt,
 *     output: response,
 *     usage: { 
 *       input_tokens: 100,
 *       output_tokens: 200,
 *       total_tokens: 300
 *     }
 *   })
 * 
 *   // Finalize trace
 *   finalizeTrace(trace, { response: finalResponse })
 * }
 */
