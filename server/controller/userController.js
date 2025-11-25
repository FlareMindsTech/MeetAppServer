// controller/userController.js
import User from "../Model/userSchema.js";
import bcrypt from "bcryptjs";

export const createUser = async (req, res) => {
  try {
    const { FirstName, LastName, email, phoneNumber, password, role } = req.body;
    const requesterRole = req.user.role; // The role of the person CALLING the API

    // --- SECURITY CHECKS ---

    // 1. Prevent creating an 'owner' (Owners are usually created manually in DB)
    if (role === "owner") {
      return res.status(403).json({ message: "Cannot create Owner accounts via API" });
    }

    // 2. Only Owners can create Admins
    if (role === "admin" && requesterRole !== "owner") {
      return res.status(403).json({ message: "Only Owners can create Admins" });
    }

    // 3. Admins and Owners can create Students
    if (role === "student" && !["owner", "admin"].includes(requesterRole)) {
      return res.status(403).json({ message: "Not authorized to create students" });
    }

    // --- CREATION LOGIC ---

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password
    // (Assuming your User Model DOES NOT have a pre-save hook. 
    // If your model hashes automatically, remove this block)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      FirstName,
      LastName,
      email,
      phoneNumber,
      password: hashedPassword,
      role: role, // 'admin' or 'student'
    });

    await newUser.save();

    res.status(201).json({
      message: `${role} created successfully by ${requesterRole}`,
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
