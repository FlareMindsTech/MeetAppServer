import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message_type: {
      type: String,
      enum: ["TEXT", "IMAGE", "FILE"],
      default: "TEXT",
    },
    content: {
      type: String,
      required: true,
    },
    read_at: {
      type: Date,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);


const participantSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  role: {
    type: String,
    enum: ["admin", "member"],
    default: "member",
  },
  joined_at: {
    type: Date,
    default: Date.now,
  },
});


const chatSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["SINGLE", "GROUP", "COURSE_GROUP"],
      required: true,
    },
    title: {
      type: String,
      trim: true,
    },
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

     participants: [participantSchema],

     messages: [messageSchema],

     last_message_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

chatSchema.index({ "participants.user_id": 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ course_id: 1 });
chatSchema.index({ last_message_at: -1 });

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;