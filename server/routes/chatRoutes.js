import express from "express";
const router = express.Router();
import auth from "../middleware/authMiddleware.js";
import checkRoles from "../middleware/rolesMiddleware.js";
import {
  getOrCreateSingleChat,
  createGroupChat,
  getConversations,
  sendMessage,
  getMessages,
  markAsRead,
  manageParticipants
} from "../controller/chatController.js";

const adminOrInstructor = checkRoles(["owner", "admin", "instructor"]);

router.use(auth);

router.post("/conversation/single", getOrCreateSingleChat);
router.post("/conversation/group", adminOrInstructor, createGroupChat);
router.get("/conversations", getConversations);
router.post("/conversation/:id/manage-user", adminOrInstructor, manageParticipants);

router.post("/message", sendMessage);
router.get("/messages", getMessages);
router.post("/message/read", markAsRead);

export default router;