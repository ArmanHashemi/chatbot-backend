import { logger } from '../services/logger.js'
// Socket.IO handlers
export function registerSocketHandlers(io, deps = {}) {
  const chatQueue = deps.chatQueue

  async function emitQueueStats(target) {
    if (!chatQueue) return
    try {
      const [waiting, delayed, active] = await Promise.all([
        chatQueue.getWaitingCount(),
        chatQueue.getDelayedCount(),
        chatQueue.getActiveCount(),
      ])
      const length = waiting + delayed + active
      const payload = { waiting, delayed, active, length }
      if (target) io.to(target).emit('queue:stats', payload)
      else io.emit('queue:stats', payload)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('emitQueueStats error', e)
    }
  }

  // Cancel any waiting/delayed/active jobs for this client
  async function cancelClientJobs(clientId) {
    if (!chatQueue || !clientId) return
    try {
      const jobs = await chatQueue.getJobs(['waiting', 'delayed', 'active'])
      const mine = jobs.filter((j) => j?.data?.clientId === clientId)
      let cancelledCount = 0
      for (const job of mine) {
        try {
          const state = await job.getState()
          await job.remove()
          cancelledCount++
          logger.info('socket:cancel_job', { clientId, jobId: job.id, state })
        } catch (e) {
          logger.warn('socket:cancel_job_error', { clientId, jobId: job.id, error: e?.message })
        }
      }
      if (cancelledCount > 0) {
        logger.info('socket:cancelled_jobs', { clientId, cancelledCount })
        // Emit updated queue stats after cancellation
        emitQueueStats()
      }
    } catch (e) {
      logger.warn('socket:cancel_jobs_error', { clientId, error: e?.message })
    }
  }

  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log('Socket connected:', socket.id)
    // send initial stats to this socket
    emitQueueStats(socket.id)

    socket.on('queue:stats:request', () => emitQueueStats(socket.id))

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('Socket disconnected:', socket.id)
      // Best-effort: cancel any queued jobs for this client
      cancelClientJobs(socket.id)
    })
  })

  // Periodic cleanup: remove orphan waiting/delayed jobs whose client is disconnected or missing
  const ORPHAN_TTL_MS = Number(process.env.ORPHAN_JOB_TTL_MS) || 5 * 60 * 1000 // default 5 minutes
  const CLEANUP_INTERVAL_MS = Number(process.env.ORPHAN_CLEANUP_INTERVAL_MS) || 60 * 1000 // default every 60s
  setInterval(async () => {
    if (!chatQueue) return
    try {
      const now = Date.now()
      const jobs = await chatQueue.getJobs(['waiting', 'delayed'])
      for (const j of jobs) {
        try {
          const cid = j?.data?.clientId
          const exp = Number(j?.data?.expiresAt) || 0
          const age = now - (j?.timestamp || now)
          const socketAlive = cid && io.sockets.sockets.get(cid)
          const orphan = !cid || !socketAlive
          const isExpired = exp > 0 && now > exp
          if (isExpired || (orphan && age > ORPHAN_TTL_MS)) {
            await j.remove()
            logger.info('cleanup:removed', { jobId: j.id, clientId: cid, ageMs: age, expired: isExpired })
          }
        } catch (e) {
          logger.warn('cleanup:job_error', { jobId: j?.id, error: e?.message })
        }
      }
    } catch (e) {
      logger.warn('cleanup:error', { error: e?.message })
    }
  }, CLEANUP_INTERVAL_MS)
}

export default registerSocketHandlers
