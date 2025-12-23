import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    meetingUrl: {
      type: String,
      default: null,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    students: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        status: {
          type: String,
          enum: ["online", "offline"],
          default: "offline",
        },
      },
    ],
    status: {
      type: String,
      enum: ["Upcoming", "Ongoing", "Completed"],
      default: "Upcoming",
    },
    deleteAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Meeting", meetingSchema);
