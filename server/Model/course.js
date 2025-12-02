import mongoose from "mongoose";

const emiPlanSchema = new mongoose.Schema(
  {
    name: { type: String }, // e.g., "3 months EMI", "6 months EMI"
    plan_id: { type: String }, // optional Razorpay plan id (if using gateway plans)
    installments: { type: Number, required: true }, // number of installments
    interestPercent: { type: Number, default: 0 }, // optional interest %
    perInstallmentAmount: { type: Number }, // optional precomputed amount (in INR)
    totalAmount: { type: Number }, // optional totalAmount (may include interest)
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    category: String,
    price: { type: Number, required: true }, // base price
    createdBy: String,
    duration: String,
    durationInDays: { type: Number, default: 365 },
    thumbnail: String,
    isLiveCourse: { type: Boolean, default: false },

    // PAYMENT OPTIONS for this course
    paymentOptions: {
      allowFullPayment: { type: Boolean, default: true },
      allowEMI: { type: Boolean, default: false },
      emiPlans: [emiPlanSchema],
    },

    // ... other fields ...
  },
  { timestamps: true }
);

export default mongoose.model("Course", courseSchema);