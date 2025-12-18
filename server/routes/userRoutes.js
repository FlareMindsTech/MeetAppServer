import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";
import { upload } from "../config/multer.js";

// Controllers
import { getProfile, updatePassword, updateProfile } from "../controller/studentController.js";
import { register } from "../controller/authController.js";
import { deactivateStudent, getAllStudents, getStudentDetail, updateStudentDetail, deleteStudent } from "../controller/adminController.js";
import { markLessonComplete, getStudentProgress, getModuleProgress } from "../controller/progressController.js";

// Roles
const adminOnly = checkRoles(["owner", "admin"]);

// --- STUDENT PROFILE ---
router.get("/user/profile", auth, getProfile);
router.put("/user/profile", auth, upload.single("photo"), updateProfile);
router.put("/user/profile/password", auth, updatePassword);

// --- STUDENT PROGRESS ---
router.get("/progress/courses", auth, getStudentProgress);
router.post("/progress/lessons/:lessonId", auth, markLessonComplete);
router.get("/progress/modules/:moduleId", auth, getModuleProgress);

// --- ADMIN STUDENT MANAGEMENT ---
router.post("/admin/create-student", auth, adminOnly, register);
router.get("/admin/students", auth, adminOnly, getAllStudents);
router.get("/admin/students/:student_id", auth, adminOnly, getStudentDetail);
router.put("/admin/update-students/:student_id", auth, adminOnly, upload.single("photo"), updateStudentDetail);
router.post("/admin/students/:student_id/deactivate", auth, adminOnly, deactivateStudent);
router.delete("/admin/students/:student_id/delete", auth, adminOnly, deleteStudent);
export default router;