import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const subscriptionSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  subscribedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

const userSchema = new mongoose.Schema(
  {
    FirstName: { type: String, trim: true },
    LastName: { type: String, trim: true },
    email: { type: String, unique: true, lowercase: true, required: true },

    phoneNumber: { type: String, unique: true, sparse: true },
    password: { type: String, minlength: 6, required: true },
    rawPassword: { type: String },
    gender: { type: String, enum: ["Male", "Female", "others"] },
    role: {
      type: String,
      enum: ["owner", "admin", "student"],
      default: "student",
    },
    photo: { type: String, default: "" },
    city: { type: String },
    state: { type: String },
    pinCode: { type: String },
    profilePic: { type: String },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    subscribedCourses: [subscriptionSchema],
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

export default mongoose.model("User", userSchema);
