import express from "express";
import {
  createMeeting,
  allocateStudents,
  removeStudents,
  rescheduleMeeting,
  deleteMeeting,
  getCourseLiveClasses,
  getAllMeetings,
  getMyMeetings,
  joinMeeting
} from "../controller/meetingController.js"; 
import auth from "../middleware/authMiddleware.js"; 

const router = express.Router();


router.post("/", auth, createMeeting);


router.post("/:id/allocate", auth, allocateStudents);

router.post("/:id/remove-students", auth, removeStudents);


router.put("/:id/reschedule", auth, rescheduleMeeting);


router.delete("/:id", auth, deleteMeeting);

router.get("/course/:courseId", auth, getCourseLiveClasses);

router.get("/", auth, getAllMeetings);


router.get("/my-meetings", auth, getMyMeetings);
router.post("/join/:id", auth, joinMeeting);

export default router;