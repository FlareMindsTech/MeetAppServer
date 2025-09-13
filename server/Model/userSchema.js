const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    Firstname: { type: String, trim: true },
    Lastname: { type: String, trim: true },
    email: { type: String, unique: true, lowercase: true },
    phoneNumber: { type: String, unique: true },
    password: { type: String, minlength: 6 },
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

module.exports = mongoose.model("User", userSchema);
