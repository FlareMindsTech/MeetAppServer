import mongoose from "mongoose";

const subModuleSchema = new mongoose.Schema(
  {
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    thumbnail: { type: String }, // Optional thumbnail for the sub-topic
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("SubModule", subModuleSchema);
