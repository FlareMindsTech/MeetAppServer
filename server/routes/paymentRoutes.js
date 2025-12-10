import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";

// Controllers
import { 
  createOrder, verifyPayment, createSubscription, razorpayWebhook,
  getAllSubscriptions, cancelSubscription, getAllPayments, initiatePayment, getSubscriptionStatus
} from "../controller/paymentController.js";

// Roles
const adminOnly = checkRoles(["owner", "admin"]);
const studentOnly = checkRoles(["student"]);

// --- STUDENT PAYMENTS ---
router.post("/payment/initiate", auth, studentOnly, initiatePayment);
router.post("/payment/verify", auth, studentOnly, verifyPayment);
router.get("/subscription/status", auth, studentOnly, getSubscriptionStatus);
router.post("/payment/create-subscription", auth, studentOnly, createSubscription);
router.post("/payment/webhook", razorpayWebhook);

// --- ADMIN PAYMENTS ---
router.get("/admin/subscriptions", auth, adminOnly, getAllSubscriptions);
router.post("/admin/subscriptions/:id/cancel", auth, adminOnly, cancelSubscription);
router.get("/admin/payments", auth, adminOnly, getAllPayments);

export default router;