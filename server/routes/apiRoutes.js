import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";
import { createUser } from "../controller/userController.js";

// --- IMPORT ALL CONTROLLERS ---
import { register, login, resetPassword, logout} from "../controller/authController.js";
import { getProfile, updatePassword, updateProfile } from "../controller/studentController.js";
import { 
  getPublicCourses, getCourseDetails, enrollStudent, 
  getAllCourses, createCourse, updateCourse, deleteCourse, getCoursePurchasedStudents, getCourseModules 
} from "../controller/courseController.js";
import { 
  getModuleLessons, getLessonDetails, downloadLessonResource 
} from "../controller/lessonController.js";
import { 
  addModule, updateModule, deleteModule, 
  createLesson, updateLesson, deleteLesson, deactivateStudent, uploadResource, getAllStudents, getStudentDetail
} from "../controller/adminController.js";
import { 
  createOrder, verifyPayment, createSubscription, razorpayWebhook,
  getAllSubscriptions, cancelSubscription, getAllPayments, initiatePayment, getSubscriptionStatus
} from "../controller/paymentController.js";
import { markLessonComplete, getStudentProgress, getModuleProgress } from "../controller/progressController.js";
import { getModuleQuiz, submitQuiz, getQuizResult, 
        createQuiz, getAllQuizzes, addQuestionsToQuiz, updateQuiz, deleteQuiz
} from "../controller/quizController.js";
import { getAboutUs, getPrivacyPolicy, getTerms, updateCMSPage, getAllCMSPages } from "../controller/cmsController.js";
import { getUserNotifications, markNotificationRead, createAnnouncement, deleteAnnouncement, getAllAnnouncements } from "../controller/notificationController.js";
import { getPerformanceReport, getEngagementMetrics, getAdminCourseReports, getStudentActivityReport, 
         getQuizPerformanceReport } from "../controller/analyticsController.js";



import { upload } from "../config/multer.js"; 
import { uploadContent } from "../config/multerContent.js"; 

// --- ROLES ---
const ownerOnly = checkRoles(["owner"]);
const adminOnly = checkRoles(["owner", "admin"]);
const studentOnly = checkRoles(["student"]);


// ==============================================================================
//                                STUDENT (USER) SIDE
// ==============================================================================

// a) Authentication & Profile 
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/reset-password", resetPassword);
router.get("/user/profile", auth, getProfile);
router.put("/user/profile", auth, upload.single("photo"), updateProfile);
router.put("/user/profile/password", auth, updatePassword);

// b) Courses / Learning Paths 
router.get("/courses", getPublicCourses);
router.get("/courses/:id", getCourseDetails);
router.get("/courses/:id/modules", getCourseModules); 
router.post("/courses/:id/enroll", auth, enrollStudent);

// c) Content Delivery 
router.get("/modules/:moduleId/lessons", auth, getModuleLessons);
router.get("/lessons/:lessonId", auth, getLessonDetails);
router.get("/lessons/:lessonId/download", auth, downloadLessonResource);

// d) Quiz / Assessment
router.get("/module/:moduleId/quiz", auth, getModuleQuiz);
router.post("/quiz/:quizId/submit", auth, submitQuiz);
router.get("/quiz/:quizId/result", auth, getQuizResult);

// e) Progress Tracking 
router.get("/progress/courses", auth, getStudentProgress);
router.post("/progress/lessons/:lessonId", auth, markLessonComplete);
router.get("/progress/modules/:moduleId", auth, getModuleProgress);

// f) Notifications 
router.get("/notifications", auth, getUserNotifications);
router.post("/notifications/:notificationId/mark-read", auth, markNotificationRead);

// g) Analytics / Reports 
router.get("/reports/performance", auth, getPerformanceReport);
router.get("/reports/engagement", auth, getEngagementMetrics);

// h) Static / CMS Pages 
router.get("/cms/about-us", getAboutUs);
router.get("/cms/privacy-policy", getPrivacyPolicy);
router.get("/cms/terms", getTerms);

// i) Payments / Subscription 
router.post("/payment/initiate", auth, studentOnly, createOrder, initiatePayment);
router.post("/payment/verify", auth, studentOnly, verifyPayment);
router.get("/subscription/status", auth, studentOnly, getSubscriptionStatus); // Reused logic
router.post("/payment/create-subscription", auth, studentOnly, createSubscription);
router.post("/payment/webhook", razorpayWebhook);


// ==============================================================================
//                                ADMIN / INSTITUTE SIDE
// ==============================================================================

// a) Admin Auth 
router.post("/auth/owner/create-admin", auth, ownerOnly, register);
router.post("/auth/admin/create-student", auth, adminOnly, register);
router.post("/admin/login", login);
router.post("/admin/logout", auth, adminOnly, logout);

// b) Course / Module Management [cite: 123]
router.get("/admin/courses", auth, adminOnly, getAllCourses);
router.post("/admin/courses/create", auth, adminOnly, upload.single("thumbnail"), createCourse);
router.put("/admin/courses/:id/update", auth, adminOnly, upload.single("thumbnail"), updateCourse);
router.delete("/admin/courses/:id/delete", auth, adminOnly, deleteCourse);
router.get("/admin/courses/:courseId/students", auth, adminOnly, getCoursePurchasedStudents); // Extra helper

// Module Management
router.post("/admin/courses/:id/modules", auth, adminOnly, addModule);
router.put("/admin/modules/:moduleId/update", auth, adminOnly, updateModule);
router.delete("/admin/modules/:moduleId/delete", auth, adminOnly, deleteModule);

// c) Content / Lesson Management [cite: 142]
router.post("/admin/lessons/create", auth, adminOnly, uploadContent.single("contentFile"), createLesson);
router.put("/admin/lessons/:id/update", auth, adminOnly, uploadContent.single("contentFile"), updateLesson);
router.delete("/admin/lessons/:id/delete", auth, adminOnly, deleteLesson);
router.post("/admin/lesson/upload", auth, adminOnly, uploadContent.single("contentFile"), uploadResource);
// d) Quiz Management
router.get("/admin/quizzes", auth, adminOnly, getAllQuizzes); 
router.post("/admin/quiz/create", auth, adminOnly, createQuiz); 
router.post("/admin/quiz/:quizId/questions", auth, adminOnly, addQuestionsToQuiz); 
router.put("/admin/quiz/:quizId/update", auth, adminOnly, updateQuiz); 
router.delete("/admin/quiz/:quizId/delete", auth, adminOnly, deleteQuiz); 

// e) Student Management 
router.post("/admin/create-user", auth, adminOnly, register);
router.get("/admin/students", auth, adminOnly, getAllStudents); 
router.get("/admin/students/:student_id", auth, adminOnly, getStudentDetail);
router.post("/admin/students/:student_id/deactivate", auth, adminOnly, deactivateStudent);


// f) Progress / Analytics (Admin) 
router.get("/admin/reports/course-performance", auth, adminOnly, getAdminCourseReports);
router.get("/admin/reports/student-activity", auth, adminOnly, getStudentActivityReport); 
router.get("/admin/reports/quiz-performance", auth, adminOnly, getQuizPerformanceReport); 

// g) Notifications / Announcements 
router.post("/admin/announcement/create", auth, adminOnly, createAnnouncement);
router.get("/admin/announcement/list", auth, adminOnly, getAllAnnouncements);
router.delete("/admin/announcement/delete/:id", auth, adminOnly, deleteAnnouncement);

// h) CMS Management 
router.get("/admin/cms/pages", auth, adminOnly, getAllCMSPages); 
router.put("/admin/cms/page/:pageId", auth, adminOnly, updateCMSPage);

// i) Payment / Subscription Management 
router.get("/admin/subscriptions", auth, adminOnly, getAllSubscriptions);
router.post("/admin/subscriptions/:id/cancel", auth, adminOnly, cancelSubscription);
router.get("/admin/payments", auth, adminOnly, getAllPayments);

// //j notifications 
// router.post("/admin/notifications/create", auth, adminOnly, createAnnouncement);

export default router;