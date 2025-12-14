import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";

// Controllers
import { register, login, resetPassword, requestPasswordReset, logout } from "../controller/authController.js";

// Roles
const ownerOnly = checkRoles(["owner"]);
const adminOnly = checkRoles(["owner", "admin"]);

// --- PUBLIC AUTH ---
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.post("/auth/forgot-password", requestPasswordReset);
router.post("/auth/reset-password/:resetToken", resetPassword);

// --- ADMIN AUTH ---
router.post("/auth/owner/create-admin", auth, ownerOnly, register);
router.post("/auth/admin/create-student", auth, adminOnly, register);


export default router;