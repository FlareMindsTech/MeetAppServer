import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../Model/userSchema.js";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/emailService.js";
import { sendSMSOTP } from "../utils/otpService.js";

const normalizePhone = (phone) => {
  if (!phone) return phone;
  const cleaned = phone.toString().replace(/\D/g, "");
  // If 10 digits, prepend 91 (India)
  return cleaned.length === 10 ? "91" + cleaned : cleaned;
};

// @desc    Register a new user (Student, Admin, etc.)
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { FirstName, LastName, phoneNumber, email, password, role, adminSecret } = req.body;
    const normalizedPhone = normalizePhone(phoneNumber);

    const existing = await User.findOne({ 
      $or: [{ email }, { phoneNumber: normalizedPhone }] 
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

    const sessionId = !req.user ? crypto.randomBytes(16).toString("hex") : null;
    
    const newUser = new User({
      FirstName,
      LastName,
      phoneNumber: normalizedPhone,
      email,
      password,
      role: assignedRole,
      isActive: true,
      photo: photoUrl,
      sessionId: sessionId
    });

    await newUser.save();

    let token = null;
    if (sessionId) {
      token = jwt.sign(
        { id: newUser._id, role: newUser.role, email: newUser.email, sessionId: sessionId },
        process.env.JWT_SECRET
      );
    }

    res.status(201).json({
      message: `User registered successfully as ${assignedRole}`,
      token, 
      user: {
        _id: newUser._id,
        FirstName: newUser.FirstName,
        LastName: newUser.LastName,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
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
      return res.status(400).json({ message: "Email/Phone and password are required" });
    }

    const normalizedPhone = phoneNumber ? normalizePhone(phoneNumber) : (email && email.match(/^\d{10}$/) ? normalizePhone(email) : null);

    // Find user by Email OR Phone
    const user = await User.findOne({
      $or: [{ email: email }, { phoneNumber: normalizedPhone }],
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
    // Generate new Session ID
    const sessionId = crypto.randomBytes(16).toString("hex");
    user.sessionId = sessionId;
    
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email, sessionId: sessionId },
      process.env.JWT_SECRET
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        FirstName: user.FirstName,
        LastName: user.LastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Request OTP for Mobile Login
// @route   POST /api/auth/request-otp
export const requestOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const normalizedPhone = normalizePhone(phoneNumber);

    if (!normalizedPhone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    console.log(`[OTP Request] Phone: ${phoneNumber}, Normalized: ${normalizedPhone}`);
    console.log(`[OTP Request] SMS_DEV_MODE: ${process.env.SMS_DEV_MODE}`);

    // Generate 4-digit OTP (Predictable 1234 in Dev Mode)
    const otp = process.env.SMS_DEV_MODE === "true" 
      ? "1234" 
      : Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Find or Create User
    let user = await User.findOne({ phoneNumber: normalizedPhone });
    if (!user) {
      // Create new user if doesn't exist (Signup)
      user = new User({
        phoneNumber: normalizedPhone,
        role: "student",
        isActive: true
      });
    }

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    console.log(`[OTP Request] Saved OTP ${otp} for user ${user._id}`);

    // Check if API key is configured (Safety check for Production)
    if (process.env.SMS_DEV_MODE !== "true" && !process.env.FAST2SMS_API_KEY) {
        console.error("[OTP Request] CRITICAL: FAST2SMS_API_KEY is missing from environment variables!");
        return res.status(500).json({ message: "Sms service configuration error. Please contact admin." });
    }

    // Send OTP via SMS
    try {
        await sendSMSOTP(normalizedPhone, otp);
    } catch (smsError) {
        console.error("[OTP Request] SMS provider error:", smsError.message);
        return res.status(500).json({ message: smsError.message || "Failed to deliver SMS. Check provider balance." });
    }

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("Request OTP Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Verify OTP and Login
// @route   POST /api/auth/verify-otp
export const verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    const normalizedPhone = normalizePhone(phoneNumber);

    if (!normalizedPhone || !otp) {
      return res.status(400).json({ message: "Phone number and OTP are required" });
    }

    const user = await User.findOne({ 
      phoneNumber: normalizedPhone, 
      otp, 
      otpExpires: { $gt: Date.now() } 
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account deactivated" });
    }

    // Clear OTP
    user.otp = undefined;
    user.otpExpires = undefined;
    user.lastLogin = new Date();

    const sessionId = crypto.randomBytes(16).toString("hex");
    user.sessionId = sessionId;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email, sessionId: sessionId },
      process.env.JWT_SECRET
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        FirstName: user.FirstName,
        LastName: user.LastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Request Password Reset (Send Email)
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

    // 3. Send Email using centralized service
    try {
      await sendPasswordResetEmail(user, resetToken);
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
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123", { ignoreExpiration: true });
        const user = await User.findById(decoded.id);
        if (user) {
          user.sessionId = crypto.randomBytes(16).toString("hex");
          await user.save();
        }
      } catch (err) {
        // Ignore token errors on logout
      }
    }

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