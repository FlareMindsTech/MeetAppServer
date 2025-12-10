import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";

// Controllers
import { getAboutUs, getPrivacyPolicy, getTerms, updateCMSPage, getAllCMSPages } from "../controller/cmsController.js";
import { getUserNotifications, markNotificationRead, createAnnouncement, deleteAnnouncement, getAllAnnouncements } from "../controller/notificationController.js";
import { getPerformanceReport, getEngagementMetrics, getAdminCourseReports, getStudentActivityReport, getQuizPerformanceReport } from "../controller/analyticsController.js";
import { createMeeting, allocateStudents, removeStudents, rescheduleMeeting, deleteMeeting, getCourseLiveClasses } from "../controller/meetingController.js";

// Roles
const adminOnly = checkRoles(["owner", "admin"]);
const studentOnly = checkRoles(["student"]);

// --- CMS (STATIC PAGES) ---
router.get("/cms/about-us", getAboutUs);
router.get("/cms/privacy-policy", getPrivacyPolicy);
router.get("/cms/terms", getTerms);
router.get("/admin/cms/pages", auth, adminOnly, getAllCMSPages);
router.put("/admin/cms/page/:pageId", auth, adminOnly, updateCMSPage);

// --- NOTIFICATIONS ---
router.get("/notifications", auth, getUserNotifications);
router.post("/notifications/:notificationId/mark-read", auth, markNotificationRead);
router.post("/admin/announcement/create", auth, adminOnly, createAnnouncement);
router.get("/admin/announcement/list", auth, adminOnly, getAllAnnouncements);
router.delete("/admin/announcement/delete/:id", auth, adminOnly, deleteAnnouncement);

// --- ANALYTICS ---
router.get("/reports/performance", auth, getPerformanceReport);
router.get("/reports/engagement", auth, getEngagementMetrics);
router.get("/admin/reports/course-performance", auth, adminOnly, getAdminCourseReports);
router.get("/admin/reports/student-activity", auth, adminOnly, getStudentActivityReport);
router.get("/admin/reports/quiz-performance", auth, adminOnly, getQuizPerformanceReport);

// --- LIVE CLASSES / MEETINGS ---
router.get("/courses/:courseId/live-classes", auth, studentOnly, getCourseLiveClasses);
router.post("/admin/meetings/create", auth, adminOnly, createMeeting);
router.post("/admin/meetings/:meetingId/allocate-students", auth, adminOnly, allocateStudents);
router.post("/admin/meetings/:meetingId/remove-students", auth, adminOnly, removeStudents);
router.put("/admin/meetings/:meetingId/reschedule", auth, adminOnly, rescheduleMeeting);
router.delete("/admin/meetings/:meetingId/delete", auth, adminOnly, deleteMeeting);

export default router;