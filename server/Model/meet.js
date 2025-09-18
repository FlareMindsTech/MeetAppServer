const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  className: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  students: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline'
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Meeting', meetingSchema);
