// Unified API response helpers
// Shape:
// {
//   ok: boolean,
//   message: string | null,
//   result: any | null,
//   error: { code: string, details?: any } | null,
//   meta?: object
// }

export function sendOk(res, result = null, message = null, meta = undefined) {
  const body = { ok: true, message, result, error: null }
  if (meta !== undefined) body.meta = meta
  return res.status(200).json(body)
}

export function sendAccepted(res, result = null, message = null, meta = undefined) {
  const body = { ok: true, message, result, error: null }
  if (meta !== undefined) body.meta = meta
  return res.status(202).json(body)
}

export function sendFail(res, status = 400, message = 'Bad Request', code = 'BAD_REQUEST', details = undefined) {
  const body = { ok: false, message, result: null, error: { code } }
  if (details !== undefined) body.error.details = details
  return res.status(status).json(body)
}
