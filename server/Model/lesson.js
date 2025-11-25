import mongoose from "mongoose";

const lessonSchema = new mongoose.Schema(
  {
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      required: true,
    },
    title: { type: String, required: true },
    type: { type: String, enum: ["video", "pdf", "text"], required: true },
    contentUrl: { type: String, required: true },
    isFree: { type: Boolean, default: false },
    duration: { type: Number },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Lesson", lessonSchema);
