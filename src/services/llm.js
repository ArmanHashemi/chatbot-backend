import axios from 'axios'

const TEXT_URL = process.env.TEXT_URL || 'http://127.0.0.1:7860/'
const SPEECH_URL = process.env.SPEECH_URL || 'http://127.0.0.1:7863/'
const SIMILARITY_URL = process.env.SIMILARITY_URL || 'http://127.0.0.1:7863/'

const TEXT_GENERATE_PATH = process.env.TEXT_GENERATE_PATH || '/generate'
const SPEECH_PATH = process.env.SPEECH_PATH || '/speech'
const SIMILARITY_PATH = process.env.SIMILARITY_PATH || '/similarity'

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
