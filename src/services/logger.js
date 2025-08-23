import util from 'node:util'

function ts() {
  return new Date().toISOString()
}

function fmt(level, msg, meta) {
  const base = { time: ts(), level, msg }
  const out = meta ? { ...base, ...meta } : base
  return JSON.stringify(out)
}

export const logger = {
  debug(msg, meta) {
    // eslint-disable-next-line no-console
    console.debug(fmt('debug', msg, safeMeta(meta)))
  },
  info(msg, meta) {
    // eslint-disable-next-line no-console
    console.log(fmt('info', msg, safeMeta(meta)))
  },
  warn(msg, meta) {
    // eslint-disable-next-line no-console
    console.warn(fmt('warn', msg, safeMeta(meta)))
  },
  error(msg, meta) {
    // eslint-disable-next-line no-console
    console.error(fmt('error', msg, safeMeta(meta)))
  },
  child(bindings = {}) {
    return {
      debug: (msg, meta) => logger.debug(msg, { ...bindings, ...safeMeta(meta) }),
      info: (msg, meta) => logger.info(msg, { ...bindings, ...safeMeta(meta) }),
      warn: (msg, meta) => logger.warn(msg, { ...bindings, ...safeMeta(meta) }),
      error: (msg, meta) => logger.error(msg, { ...bindings, ...safeMeta(meta) }),
    }
  },
}

function safeMeta(meta) {
  if (!meta) return undefined
  try {
    return JSON.parse(JSON.stringify(meta, censor))
  } catch {
    return { meta: util.inspect(meta, { depth: 2 }) }
  }
}

function censor(key, value) {
  if (key.toLowerCase() === 'authorization' || key.toLowerCase().includes('token')) return '[REDACTED]'
  if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…'
  return value
}
