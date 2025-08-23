import mongoose from 'mongoose'

export async function connectDB(uri) {
  const MONGO_URI = uri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatbot'
  mongoose.set('strictQuery', true)
  await mongoose.connect(MONGO_URI, {
    autoIndex: true,
  })
  // eslint-disable-next-line no-console
  console.log('MongoDB connected')
}

export default mongoose
