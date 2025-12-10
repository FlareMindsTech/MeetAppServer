import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";
import { upload } from "../config/multer.js";
import { uploadContent } from "../config/multerContent.js";

// Controllers
import { 
  getPublicCourses, getCourseDetails, enrollStudent, 
  getAllCourses, createCourse, updateCourse, deleteCourse, getCoursePurchasedStudents, getCourseModules 
} from "../controller/courseController.js";
import { 
  getModuleLessons, getLessonDetails, downloadLessonResource 
} from "../controller/lessonController.js";
import { 
  addModule, updateModule, deleteModule, 
  createLesson, updateLesson, deleteLesson, uploadResource 
} from "../controller/adminController.js";

// Roles
const adminOnly = checkRoles(["owner", "admin"]);

// --- STUDENT / PUBLIC ---
router.get("/courses", getPublicCourses);
router.get("/courses/:id", getCourseDetails);
router.get("/courses/:id/modules", getCourseModules);
router.post("/courses/:id/enroll", auth, enrollStudent);

router.get("/modules/:moduleId/lessons", auth, getModuleLessons);
router.get("/lessons/:lessonId", auth, getLessonDetails);
router.get("/lessons/:lessonId/download", auth, downloadLessonResource);

// --- ADMIN COURSE MANAGEMENT ---
router.get("/admin/courses", auth, adminOnly, getAllCourses);
router.post("/admin/courses/create", auth, adminOnly, upload.single("thumbnail"), createCourse);
router.put("/admin/courses/:id/update", auth, adminOnly, upload.single("thumbnail"), updateCourse);
router.delete("/admin/courses/:id/delete", auth, adminOnly, deleteCourse);
router.get("/admin/courses/:courseId/students", auth, adminOnly, getCoursePurchasedStudents);

// --- ADMIN MODULE MANAGEMENT ---
router.post("/admin/courses/:id/modules", auth, adminOnly, addModule);
router.put("/admin/modules/:moduleId/update", auth, adminOnly, updateModule);
router.delete("/admin/modules/:moduleId/delete", auth, adminOnly, deleteModule);

// --- ADMIN LESSON MANAGEMENT ---
router.post("/admin/lessons/create", auth, adminOnly, uploadContent.single("contentFile"), createLesson);
router.put("/admin/lessons/:id/update", auth, adminOnly, uploadContent.single("contentFile"), updateLesson);
router.delete("/admin/lessons/:id/delete", auth, adminOnly, deleteLesson);
router.post("/admin/lesson/upload", auth, adminOnly, uploadContent.single("contentFile"), uploadResource);

export default router;