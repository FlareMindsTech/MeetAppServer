import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../Model/userSchema.js";
import crypto from "crypto";
import transporter from "./transporter.js";

// @desc    Register a new user (Student, Admin, etc.)
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
   
    const { FirstName, LastName, phoneNumber, email, password, role, adminSecret } = req.body;

    const existing = await User.findOne({ 
      $or: [{ email }, { phoneNumber }] 
    });
    
    if (existing) {
      return res.status(400).json({ message: "User with this email or phone already exists" });
    }

    // --- SECURITY LOGIC ---
    let assignedRole = "student"; 

    
    if (req.user && (req.user.role === "owner" || req.user.role === "admin")) {
        if (role) assignedRole = role; 
    }
    
   
    else if (adminSecret === process.env.OWNER_SECRET_KEY) {
        if (role) assignedRole = role; 
    }
    let photoUrl = "";
    if (req.file) {
       photoUrl = req.file.path;
    }

    const newUser = new User({
      FirstName,
      LastName,
      phoneNumber,
      email,
      password,
      role: assignedRole ,
      isActive: true,
      photo: photoUrl
    });

    await newUser.save();

    
    let token = null;
    if (!req.user) {
        token = jwt.sign(
            { id: newUser._id, role: newUser.role, email: newUser.email },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );
    }

    res.status(201).json({
      message: `User registered successfully as ${assignedRole}`,
      token, 
      user: {
        _id: newUser._id,
        email: newUser.email,
        role: newUser.role
      }
    });

  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Login user (Common for Student, Admin, Owner)
// @route   POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password, phoneNumber } = req.body;

    if ((!email && !phoneNumber) || !password) {
      return res
        .status(400)
        .json({ message: "Email/Phone and password are required" });
    }

    // Find user by Email OR Phone
    const user = await User.findOne({
      $or: [{ email: email }, { phoneNumber: phoneNumber || email }],
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    if (user.isActive === false) {
      return res
        .status(403)
        .json({ message: "Your account has been deactivated. Contact Admin." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        FirstName: user.FirstName,
        LastName: user.LastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Request Password Reset (Send Email)
// @route   POST /api/auth/forgot-password
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: "If this email exists, a reset link has been sent." });
    }

    // 1. Generate Token
    const resetToken = crypto.randomBytes(32).toString("hex");
    
    // 2. Hash it and save to DB
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // 3. Send Email
    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
    
    try {
      await transporter.sendMail({
        to: user.email,
        subject: "Password Reset Request",
        html: `
          <h3>Password Reset</h3>
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}">${resetUrl}</a>
          <p>This link expires in 1 hour.</p>
        `,
      });
      
      res.json({ message: "If this email exists, a reset link has been sent." });
    } catch (emailErr) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      return res.status(500).json({ message: "Email sending failed." });
    }

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Reset Password (Verify Token & Change)
// @route   POST /api/auth/reset-password/:resetToken
export const resetPassword = async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password Reset Successful! You can now login." });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    
    res.status(200).json({
      message: "Logged out successfully. Please clear your client token.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};






// @desc    Get All Admins
// @route   GET /api/owner/admins
export const getAllAdmins = async (req, res) => {
  try {
    const admins = await User.find(
      { role: "admin" }, 
     
      { 
        subscribedCourses: 0,
        __v: 0
      } 
    ).sort({ createdAt: -1 });

    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update an Admin
// @route   PUT /api/owner/admins/:id
export const updateAdmin = async (req, res) => {
    const { id } = req.params;
    
    const { FirstName, LastName, email, password, role, phoneNumber } = req.body;

    try {
        const admin = await User.findById(id);
        if (!admin) return res.status(404).json({ message: "Admin not found" });

  
        if (FirstName) admin.FirstName = FirstName;
        if (LastName) admin.LastName = LastName;
        if (email) admin.email = email;
        if (phoneNumber) admin.phoneNumber = phoneNumber;

        if (role) admin.role = role;

  
        if (password) {
            const salt = await bcrypt.genSalt(10);
            admin.password = await bcrypt.hash(password, salt);
        }

    
        if (req.file) admin.photo = req.file.path;

        admin.subscribedCourses = undefined; 

        const updatedAdmin = await admin.save();

        const result = updatedAdmin.toObject();
        delete result.password;

        res.json({ 
            message: "Admin updated successfully", 
            admin: result 
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "Email already exists" });
        }
        res.status(500).json({ message: "Error updating admin", error: error.message });
    }
};
// @desc    Delete an Admin
// @route   DELETE /api/owner/admins/:id
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await User.findById(id);

    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (admin.role !== "admin") {
      return res.status(403).json({ message: "This route is only for deleting Admins" });
    }

    await admin.deleteOne();

    res.json({ message: "Admin deleted successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};