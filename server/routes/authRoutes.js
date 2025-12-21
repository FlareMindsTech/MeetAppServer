import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";
import { upload } from "../config/multer.js";

// Controllers
import { register, login, resetPassword, requestPasswordReset, logout, getAllAdmins, updateAdmin, deleteAdmin } from "../controller/authController.js";

// Roles
const ownerOnly = checkRoles(["owner"]);
// const adminOnly = checkRoles(["owner", "admin"]);

// --- PUBLIC AUTH ---
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.post("/auth/forgot-password", requestPasswordReset);
router.post("/auth/reset-password/:resetToken", resetPassword);

// --- ADMIN AUTH ---
router.post("/create-admin", auth, ownerOnly, upload.single("photo"), register);
router.get("/get-admins", auth, ownerOnly, getAllAdmins);
router.put("/update-admins/:id", auth, ownerOnly, upload.single("photo"), updateAdmin);
router.delete("/delete-admins/:id", auth, ownerOnly, deleteAdmin);



export default router;