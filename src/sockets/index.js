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

  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log('Socket connected:', socket.id)
    // send initial stats to this socket
    emitQueueStats(socket.id)

    socket.on('queue:stats:request', () => emitQueueStats(socket.id))

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('Socket disconnected:', socket.id)
    })
  })
}

export default registerSocketHandlers
