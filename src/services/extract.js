import OpenAI from 'openai'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// Use explicit paths to avoid test harness side-effects
const pdfParse = require('pdf-parse/lib/pdf-parse.js')
const mammoth = require('mammoth')

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

function bufferToDataUrl(buffer, mimetype) {
  const base64 = buffer.toString('base64')
  return `data:${mimetype};base64,${base64}`
}

export async function extractTextFromBuffer(buffer, filename, mimetype) {
  if (!buffer || !mimetype) throw new Error('invalid input for extract')

  // Plain text
  if (mimetype === 'text/plain') {
    return buffer.toString('utf8')
  }

  // PDF
  if (mimetype === 'application/pdf') {
    const res = await pdfParse(buffer)
    return res.text || ''
  }

  // DOCX
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.extractRawText({ buffer })
    return value || ''
  }

  // Images → OCR via OpenAI
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimetype)) {
    if (!openai) throw new Error('OPENAI_API_KEY missing for OCR')
    const imageUrl = bufferToDataUrl(buffer, mimetype)
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all readable text from this image. Return only the text.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0,
    })
    const text = resp?.choices?.[0]?.message?.content || ''
    return text
  }

  throw new Error(`unsupported mimetype for extraction: ${mimetype}`)
}
