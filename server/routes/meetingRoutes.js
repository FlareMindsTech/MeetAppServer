const express = require("express");
const router = express.Router();
const meetingController = require("../controller/meetingController");
const authMiddleware = require("../middleware/authMiddleware");

// CRUD + actions
router.post("/", authMiddleware, meetingController.createMeeting);
router.post("/:id/allocate", authMiddleware, meetingController.allocateStudents);
router.post("/:id/remove", authMiddleware, meetingController.removeStudents);
router.put("/:id/reschedule", authMiddleware, meetingController.rescheduleMeeting);
router.delete("/:id", authMiddleware, meetingController.deleteMeeting);

module.exports = router;
