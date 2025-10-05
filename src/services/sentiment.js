// Very simple lexicon-based sentiment analysis
// Returns { label: 'positive'|'neutral'|'negative', score: -1..1 }

const POSITIVE = new Set([
  'good','great','excellent','awesome','love','like','thanks','thank','perfect','خوب','عالی','سپاس','ممنون','دوست','راضی','اوکی','ok','fine','best'
])

const NEGATIVE = new Set([
  'bad','terrible','awful','hate','dislike','bug','issue','problem','slow','worst','broken','خراب','بد','افتضاح','کند','مشکل','ناراضی','بده'
])

export function analyzeSentiment(text = '') {
  try {
    const t = String(text || '').toLowerCase()
    if (!t.trim()) return { label: 'neutral', score: 0 }
    const tokens = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    let pos = 0, neg = 0
    for (const w of tokens) {
      if (POSITIVE.has(w)) pos++
      if (NEGATIVE.has(w)) neg++
    }
    const score = pos + neg === 0 ? 0 : (pos - neg) / (pos + neg)
    const label = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral'
    return { label, score }
  } catch {
    return { label: 'neutral', score: 0 }
  }
}
