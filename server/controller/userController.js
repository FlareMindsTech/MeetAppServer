const bcrypt = require("bcryptjs");
const User = require("../Model/userSchema");

// Create user (admin or student)
exports.createUser = async (req, res) => {
  try {
    const { FirstName, LastName, email, phoneNumber, role } = req.body;

    // generate random password
    const randomString = Math.random().toString(36).slice(-4); // 4 random chars
    const rawPassword = `${FirstName}${LastName}${email.split("@")[0]}${randomString}`;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const user = new User({
      FirstName,
      LastName,
      email,
      phoneNumber,
      password: rawPassword, // gets hashed by pre-save middleware
      rawPassword,           // store raw password in DB
      role
    });

    await user.save();

    res.status(201).json({
      message: `${role} created successfully`,
      user: {
        FirstName,
        LastName,
        email,
        phoneNumber,
        role,
        rawPassword // send raw password back after creation
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "admin") filter = { role: "student" };
    if (req.user.role === "owner") filter = { role: { $in: ["admin", "student"] } };

    // Build dynamic projection
    let projection = "-password"; // always hide hashed password
    if (req.user.role !== "admin" && req.user.role !== "owner") {
      projection += " -rawPassword"; // students cannot see raw password
    }

    const users = await User.find(filter).select(projection);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Get single user
exports.getUserById = async (req, res) => {
  try {
    // only hide hashed password, keep rawPassword for admin/owner
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
exports.updateUser = async (req, res) => {
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
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

   
    if (req.user.role === "admin" && user.role !== "student") {
      return res.status(403).json({ message: "Admins can only delete students" });
    }

    // Owner can delete anyone
   

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

