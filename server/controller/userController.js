// In createUser controller
import bcrypt from "bcryptjs";
import User from "../Model/userSchema.js";
import transporter from "./transporter.js";

// Create student/admin/owner
export const createUser = async (req, res) => {
  try {
    const { FirstName, LastName, email, phoneNumber, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    // Generate random password
    const rawPassword = Math.random().toString(36).slice(-8);

    // Save user (hashed password via pre-save)
    const newUser = new User({
      FirstName,
      LastName,
      email,
      phoneNumber,
      password: rawPassword,
      role,
      rawPassword // temporary
    });

    await newUser.save();

    res.status(201).json({
      message: "Student created successfully",
      user: { FirstName, LastName, email, phoneNumber, role }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// Get all users
export const getUsers = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "admin") filter = { role: "student" };
    if (req.user.role === "owner") filter = { role: { $in: ["admin", "student"] } };

    let projection = "-password"; // always hide hashed password
    if (!["owner", "admin"].includes(req.user.role)) {
      projection += " -rawPassword"; // students cannot see raw password
    }

    const users = await User.find(filter).select(projection);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single user
export const getUserById = async (req, res) => {
  try {
    let projection = "-password";
    if (req.user.role === "student") projection += " -rawPassword";

    const user = await User.findById(req.params.id).select(projection);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role === "admin" && user.role !== "student")
      return res.status(403).json({ message: "Admins can only view students" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { FirstName, LastName, email, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role === "admin" && user.role !== "student")
      return res.status(403).json({ message: "Admins can only update students" });

    if (FirstName) user.FirstName = FirstName;
    if (LastName) user.LastName = LastName;
    if (email) user.email = email;
    if (req.user.role === "owner" && role) user.role = role;

    await user.save();
    res.json({ message: "User updated", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user.role === "admin" && user.role !== "student") {
      return res.status(403).json({ message: "Admins can only delete students" });
    }

    // owner can delete anyone
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
