import mongoose from '../config/db.js'

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String },
    meta: { type: Object },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

export default mongoose.model('Conversation', conversationSchema)
