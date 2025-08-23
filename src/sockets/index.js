// Socket.IO handlers
export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log('Socket connected:', socket.id)

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('Socket disconnected:', socket.id)
    })
  })
}

export default registerSocketHandlers
