import mongoose from '../config/db.js'

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    liked: { type: Boolean, default: null }, // null = not rated, true = like, false = dislike
    meta: { type: Object },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

export default mongoose.model('Message', messageSchema)
