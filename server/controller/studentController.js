import User from "../Model/userSchema.js";
import Meeting from "../Model/meet.js";
import Course from "../Model/course.js";
import bcrypt from "bcryptjs"; 
// import path from "path";       
// import fs from "fs";           

// @desc    Get student profile details
// @route   GET /api/user/profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -rawPassword");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update student profile (Name, Details, Profile Pic)
// @route   PUT /api/user/profile
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    // Safely read body (multer should populate `req.body` for multipart/form-data)
    const body = req.body || {};
    if (!req.body) {
      console.debug("updateProfile: req.body is undefined. Ensure request is sent as multipart/form-data (use form-data in Postman) and include text fields.", {
        contentType: req.headers["content-type"] || null,
      });
    }

    // 1. Update Text Fields (if provided)
    if (body.FirstName) user.FirstName = body.FirstName;
    if (body.LastName) user.LastName = body.LastName;
    if (body.phoneNumber) user.phoneNumber = body.phoneNumber;
    if (body.gender) user.gender = body.gender;
    if (body.city) user.city = body.city;
    if (body.state) user.state = body.state;
    if (body.pinCode) user.pinCode = body.pinCode;
    
    // 2. Handle Profile Picture Upload
    if (req.file) {
      // If using Cloudinary (req.file.path is URL), use it directly
      // If using Local Storage, build the path

      // --- CLOUDINARY SUPPORT ---
      // If you switched to Cloudinary, just use this:
      user.profilePic = req.file.path; 
      user.photo = req.file.path;
      /* --- LOCAL STORAGE SUPPORT (Commented out if using Cloudinary) ---
      if (user.profilePic && user.profilePic.startsWith("/uploads")) {
          const oldPath = path.join(process.cwd(), user.profilePic); 
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath); 
          }
      }
      const relativePath = path.join("uploads", "thumbnails", path.basename(req.file.path)).replace(/\\/g, "/");
      user.profilePic = `/${relativePath}`;
      */
    }

    await user.save();
    
    const updatedUser = user.toObject();
    delete updatedUser.password;
    delete updatedUser.rawPassword;
    
    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update Password
// @route   PUT /api/user/profile/password
export const updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Old password is incorrect" });

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get Meetings (Live Classes)
// @route   GET /api/student/meetings
export const getMeetings = async (req, res) => {
  try {
    const studentId = req.user.id;
    const meetings = await Meeting.find({ "students.studentId": studentId })
      .sort({ date: 1, startTime: 1 });

    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// @desc    Get My Active Subscriptions
// @route   GET /api/student/my-courses
export const getMyActiveSubscriptions = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "subscribedCourses.courseId",
      select: "title thumbnail description price isLiveCourse duration category"
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = new Date();
    // Filter to show only active subscriptions
    const activeSubscriptions = user.subscribedCourses.filter(
      (sub) => sub.courseId && new Date(sub.expiresAt) > now
    );

    // Format the response to return course details directly
    const formattedResponse = activeSubscriptions.map(sub => ({
        ...sub.courseId.toObject(),
        expiresAt: sub.expiresAt,
        subscribedAt: sub.subscribedAt
    }));

    res.json(formattedResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get a specific course detail (Helper check)
// @route   GET /api/student/my-courses/:courseId
export const getSubscribedCourseVideo = async (req, res) => {
  try {
    const { courseId } = req.params;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Find the subscription
    const subscription = user.subscribedCourses.find(
      (sub) => sub.courseId.toString() === courseId
    );

    if (!subscription) {
      return res.status(403).json({ message: "You are not subscribed to this course" });
    }

    if (new Date(subscription.expiresAt) <= new Date()) {
      return res.status(403).json({ message: "Your subscription has expired" });
    }

    const course = await Course.findById(courseId).select("title thumbnail description category");
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};