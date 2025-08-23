import axios from 'axios'
import { logger as baseLogger } from './logger.js'

const TEXT_URL = process.env.TEXT_URL || 'http://127.0.0.1:7860/'
const SPEECH_URL = process.env.SPEECH_URL || 'http://127.0.0.1:7863/'
const SIMILARITY_URL = process.env.SIMILARITY_URL || 'http://127.0.0.1:7863/'
const ASSIST_URL = process.env.ASSIST_URL || process.env.TEXT_URL || 'http://127.0.0.1:7860/'

const TEXT_GENERATE_PATH = process.env.TEXT_GENERATE_PATH || '/generate'
const SPEECH_PATH = process.env.SPEECH_PATH || '/speech'
const SIMILARITY_PATH = process.env.SIMILARITY_PATH || '/similarity'
const ASSIST_PATH = process.env.ASSIST_PATH || '/assist'

export async function llmText(prompt, options = {}) {
  // Fallback: send { prompt } and try to read common fields
  const url = new URL(TEXT_GENERATE_PATH, TEXT_URL).toString()
  const payload = { prompt, ...options }
  const { data } = await axios.post(url, payload, { timeout: 60_000 })
  // try common response shapes
  return (
    data?.text || data?.reply || data?.response || data?.result || JSON.stringify(data)
  )
}

export async function llmSpeech(text, options = {}) {
  const url = new URL(SPEECH_PATH, SPEECH_URL).toString()
  const payload = { text, ...options }
  const { data } = await axios.post(url, payload, { timeout: 60_000, responseType: 'arraybuffer' })
  return data // binary audio buffer
}

export async function llmSimilarity(a, b, options = {}) {
  const url = new URL(SIMILARITY_PATH, SIMILARITY_URL).toString()
  const payload = { a, b, ...options }
  const { data } = await axios.post(url, payload, { timeout: 30_000 })
  return data // depends on service shape
}

// Post to external assist endpoint with the exact expected schema
export async function llmAssist({ action = 1, history = [], user }) {
  const url = new URL(ASSIST_PATH, ASSIST_URL).toString()
  const payload = { action, history, user }
  const log = baseLogger.child({ svc: 'llmAssist' })
  const started = Date.now()
  try {
    const parsed = Number(process.env.ASSIST_TIMEOUT_MS)
    const timeoutMs = Number.isFinite(parsed) ? parsed : 120_000
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'curl/7.79.1',
    }
    const http = await import('node:http')
    const httpAgent = new http.Agent({ keepAlive: false })
    const attempts = []

    // attempt 1: as-is
    attempts.push({ name: 'default', body: payload })
    // attempt 2: fallback without history (some servers choke on long history)
    attempts.push({ name: 'no_history', body: { action, history: [], user } })

    let lastResp
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i]
      log.info('assist:request', {
        url,
        attempt: attempt.name,
        action,
        historyLen: Array.isArray(attempt.body.history) ? attempt.body.history.length : 0,
        userRole: user?.role,
        userContentLen: typeof user?.content === 'string' ? user.content.length : 0,
      })
      const resp = await axios.post(url, attempt.body, {
        // axios timeout: 0 means no timeout
        timeout: timeoutMs > 0 ? timeoutMs : 0,
        validateStatus: () => true,
        headers,
        httpAgent,
      })
      lastResp = resp
      const data = resp.data
      const durationMs = Date.now() - started
      log.info('assist:response', {
        status: resp.status,
        durationMs,
        attempt: attempt.name,
        hasDocs: Array.isArray(data?.docs),
        docsLen: Array.isArray(data?.docs) ? data.docs.length : 0,
        responseLen: typeof data?.response === 'string' ? data.response.length : 0,
      })
      if (resp.status < 400) {
        return data
      }
      // For any non-success status, if we have more attempts, backoff then continue
      if (i < attempts.length - 1) {
        await new Promise((r) => setTimeout(r, 250))
        continue
      }
      // Final failure: throw with snippet
      const snippet = typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)
      const err = new Error(`assist http ${resp.status}: ${snippet}`)
      err.status = resp.status
      throw err
    }

    // Should not reach here
    return lastResp?.data
  } catch (err) {
    const durationMs = Date.now() - started
    baseLogger.error('assist:error', {
      url,
      durationMs,
      error: err?.message,
      status: err?.status || err?.response?.status,
      response: typeof err?.response?.data === 'string'
        ? err.response.data.slice(0, 500)
        : JSON.stringify(err?.response?.data || '').slice(0, 500),
    })
    throw err
  }
}
