import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";

// Controllers
import { 
  getSubModuleQuiz, submitQuiz, getQuizResult, 
  createQuiz, getAllQuizzes, addQuestionsToQuiz, updateQuiz, deleteQuiz
} from "../controller/quizController.js";

// Roles
const adminOnly = checkRoles(["owner", "admin"]);

// --- STUDENT QUIZ ---
router.get("/submodule/:subModuleId/quiz", auth, getSubModuleQuiz);
router.post("/quiz/:quizId/submit", auth, submitQuiz);
router.get("/quiz/:quizId/result", auth, getQuizResult);

// --- ADMIN QUIZ MANAGEMENT ---
router.get("/admin/quizzes", auth, adminOnly, getAllQuizzes);
router.post("/admin/quiz/create", auth, adminOnly, createQuiz);
router.post("/admin/quiz/:quizId/questions", auth, adminOnly, addQuestionsToQuiz);
router.put("/admin/quiz/:quizId/update", auth, adminOnly, updateQuiz);
router.delete("/admin/quiz/:quizId/delete", auth, adminOnly, deleteQuiz);

export default router;