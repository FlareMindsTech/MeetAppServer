import mongoose from "mongoose";

const quizSchema = new mongoose.Schema(
  {
    subModule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubModule",
      required: true,
    },
    title: { type: String, required: true },
    questions: [
      {
        questionText: String,
        options: [String],
        correctOption: Number,
        marks: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Quiz", quizSchema);
