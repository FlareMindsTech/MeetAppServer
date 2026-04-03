import mongoose from "mongoose";

const emiPlanSchema = new mongoose.Schema(
  {
    plan_id: { type: String }, // optional Razorpay plan id (if using gateway plans)
    installments: { type: Number, required: true }, // number of installments
    interestPercent: { type: Number, default: 0 }, // optional interest %
    perInstallmentAmount: { type: Number }, // optional precomputed amount (in INR)
    totalAmount: { type: Number }, // optional totalAmount (may include interest)
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const renewalPlanSchema = new mongoose.Schema(
  {
    durationInDays: { type: Number },
    price: { type: Number },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    category: String,
    price: { type: Number, required: true }, // base price
    discount: { type: Number, default: 0 }, // discount percentage
    createdBy: String,
    duration: String,
    durationInDays: { type: Number, default: 365 },
    thumbnail: String,
    isLiveCourse: { type: Boolean, default: false },
    isRecurring: { type: Boolean, default: false },

    // PAYMENT OPTIONS for this course
    paymentOptions: {
      allowFullPayment: { type: Boolean, default: true },
      allowEMI: { type: Boolean, default: false },
      emiPlans: [emiPlanSchema],
      allowRenewal: { type: Boolean, default: false },
      renewalPlans: [renewalPlanSchema],
    },

    // ... other fields ...
  },
  { timestamps: true }
);

courseSchema.index({ category: 1 });
courseSchema.index({ isLiveCourse: 1 });
courseSchema.index({ title: "text" }); 


export default mongoose.model("Course", courseSchema);