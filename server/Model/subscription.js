import mongoose from "mongoose";

const paymentHistorySchema = new mongoose.Schema(
  {
    payment_id: { type: String },
    order_id: { type: String },
    amount: { type: Number },
    currency: { type: String, default: "INR" },
    status: { type: String },
    paidAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed }, // store any raw payload if needed
  },
  { _id: false, timestamps: true }
);

const emiMetaSchema = new mongoose.Schema(
  {
    planName: String,
    plan_id: String,
    installments: Number,
    perInstallmentAmount: Number,
    totalAmount: Number,
    interestPercent: Number,
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // Enrollment type: free, one-time, subscription(EMI)
    type: {
      type: String,
      enum: ["free", "one-time", "subscription"],
      required: true,
    },

    amount: { type: Number },
    currency: { type: String, default: "INR" },

    plan_id: { type: String },
    razorpay_subscription_id: { type: String },
    razorpay_order_id: { type: String },

    // EMI metadata
    emi: emiMetaSchema,

    total_count: { type: Number }, // number of installments expected
    paid_count: { type: Number, default: 0 },

    next_payment_at: { type: Date },

    // Status now includes 'completed'
    status: {
      type: String,
      enum: ["active", "cancelled", "expired", "pending", "completed"],
      default: "active",
    },

    // If true, this subscription grants lifetime access
    lifetimeAccess: { type: Boolean, default: true },

    // expiry date (may be set to a far-future date for lifetime)
    expiresAt: { type: Date },

    paymentHistory: [paymentHistorySchema],
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

const Subscription = mongoose.model("Subscription", subscriptionSchema);
export default Subscription;