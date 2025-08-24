import mongoose from '../config/db.js'

const documentSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    mainTitle: { type: String, required: true },
    subTitle: { type: String },
    docText: { type: String },
    link: { type: String },
    pic: { type: String },
    userId: { type: String },
    docType: { type: String },
  },
  { timestamps: true }
)

export default mongoose.model('Document', documentSchema)
