const express = require("express");
const { register, login } = require("../controller/authController");
const userController = require("../controller/userController");
const auth = require("../middleware/authMiddleware");
const CheckRoles = require("../middleware/rolesMiddleware");

const router = express.Router();

// Public
router.post("/register", register);
router.post("/login", login);

// Protected CRUD
router.post("/create-admin", auth, CheckRoles(["owner"]), userController.createUser);
router.post("/create-student", auth, CheckRoles(["owner","admin"]), userController.createUser);
router.get("/", auth, CheckRoles(["owner","admin"]), userController.getUsers);
router.get("/:id", auth, CheckRoles(["owner","admin"]), userController.getUserById);
router.put("/:id", auth, CheckRoles(["owner","admin"]), userController.updateUser);
router.delete("/:id", auth, CheckRoles(["owner","admin"]), userController.deleteUser);

module.exports = router;
