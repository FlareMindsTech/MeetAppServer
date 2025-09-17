const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    Firstname: { type: String, trim: true },
    Lastname: { type: String, trim: true },
    email: { type: String, unique: true, lowercase: true },
    phoneNumber: { type: String, unique: true },
    password: { type: String, minlength: 6 },
    gender:{type:String, enum:["Male","Female","others"]},
    role: {
      type: String,
      enum: ["owner", "Admin", "Student"],
      default: "Student",
    },
    city: { type: String },
    state: { type: String },
    pinCode: { type: String },
    profilePic: { type: String }, //optional
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);
// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // ✅ only hash if changed
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("User", userSchema);
