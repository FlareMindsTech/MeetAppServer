// import path from "path";
// import fs from "fs";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import transporter from "./transporter.js";
import Subscription from "../Model/subscription.js";
import Module from "../Model/module.js";
import Lesson from "../Model/lesson.js";
// import Meeting from "../Model/meet.js";
// --- 1. PUBLIC & STUDENT APIs ---

// @desc    Enroll a student (Manual Subscription / Free Enrollment)
// @route   POST /api/courses/:id/enroll
export const enrollStudent = async (req, res) => {
  try {
    const courseId = req.params.id;
    const studentId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    if (course.price > 0) {
      return res
        .status(403)
        .json({ message: "This is a paid course. Please proceed to payment." });
    }

    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const existingSub = student.subscribedCourses.find(
      (sub) => sub.courseId.toString() === courseId
    );

    const now = new Date();
    if (existingSub && existingSub.expiresAt > now) {
      return res.status(400).json({ message: "You are already enrolled." });
    }

    const durationInDays = course.durationInDays || 365;
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));

    if (existingSub) {
      existingSub.expiresAt = expiresAt;
      existingSub.subscribedAt = now;
    } else {
      student.subscribedCourses.push({
        courseId: course._id,
        subscribedAt: now,
        expiresAt: expiresAt,
      });
    }

    await student.save();

    try {
      await Subscription.create({
        student: studentId,
        course: courseId,
        type: "free",
        amount: 0,
        currency: "INR",
        status: "active",
        expiresAt,
        metadata: { source: "manual-free-enroll" },
      });
    } catch (err) {
      console.error("Subscription record failed:", err);
    }

    try {
      await transporter.sendMail({
        from: `"Admin" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: `Enrollment Confirmed: ${course.title}`,
        html: `<p>Hello ${
          student.FirstName || ""
        },</p><p>You have been enrolled in <b>${course.title}</b>.</p>`,
      });
    } catch (emailErr) {
      console.error("Email failed:", emailErr);
    }

    res
      .status(200)
      .json({
        message: "Enrolled successfully",
        course: course.title,
        expiresAt,
      });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- 3. MODULE MANAGEMENT ---

// @desc    Add a Module to a Course
export const addModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, order } = req.body;

    if (!title)
      return res.status(400).json({ message: "Module title is required" });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const newModule = await Module.create({
      course: id,
      title,
      order: order || 0,
    });

    res.status(201).json(newModule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update a Module
export const updateModule = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { title, order } = req.body;

    const module = await Module.findById(moduleId);
    if (!module) return res.status(404).json({ message: "Module not found" });

    if (title) module.title = title;
    if (order !== undefined) module.order = order;

    await module.save();
    res.json(module);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a Module
export const deleteModule = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const module = await Module.findById(moduleId);
    if (!module) return res.status(404).json({ message: "Module not found" });

    await Lesson.deleteMany({ module: moduleId });
    await module.deleteOne();

    res.json({ message: "Module and all its lessons deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- 4. LESSON MANAGEMENT ---

// @desc    Create a new Lesson (Video/PDF)
export const createLesson = async (req, res) => {
  try {
    const { moduleId, title, isFree, duration, order } = req.body;
    const file = req.file;

    if (!moduleId || !title || !file) {
      return res
        .status(400)
        .json({ message: "Module ID, Title, and File are required" });
    }

    let type = "text";
    const mime = file.mimetype.toLowerCase();
    const filename = file.originalname.toLowerCase();

    if (
      mime.startsWith("video/") ||
      filename.endsWith(".mp4") ||
      filename.endsWith(".mkv") ||
      filename.endsWith(".mov")
    ) {
      type = "video";
    } else if (mime.includes("pdf") || filename.endsWith(".pdf")) {
      type = "pdf";
    }

    const contentUrl = file.path;

    const newLesson = await Lesson.create({
      module: moduleId,
      title,
      type,
      contentUrl: contentUrl,
      isFree: isFree === "true" || isFree === true,
      duration: Number(duration) || 0,
      order: Number(order) || 0,
    });

    res.status(201).json(newLesson);
  } catch (err) {
    console.error("CREATE LESSON ERROR:", err);
    res.status(500).json({ message: err.message || "Server Error" });
  }
};

// @desc    Update a Lesson
export const updateLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, isFree, order } = req.body;

    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    if (title) lesson.title = title;
    if (isFree !== undefined)
      lesson.isFree = isFree === "true" || isFree === true;
    if (order !== undefined) lesson.order = order;

    if (req.file) {
      let type = "text";
      const mime = req.file.mimetype.toLowerCase();
      const filename = req.file.originalname.toLowerCase();

      if (
        mime.startsWith("video/") ||
        filename.endsWith(".mp4") ||
        filename.endsWith(".mkv")
      ) {
        type = "video";
      } else if (mime.includes("pdf") || filename.endsWith(".pdf")) {
        type = "pdf";
      }

      lesson.contentUrl = req.file.path;
      lesson.type = type;
    }

    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


export const deleteLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    await lesson.deleteOne();
    res.json({ message: "Lesson deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- 5. STUDENT & USER MANAGEMENT ---

const canManageTarget = (requesterRole, targetRole) => {
  if (requesterRole === "owner") return true;
  if (requesterRole === "admin" && targetRole === "student") return true;
  return false;
};

export const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "student" })
      .select("-password -rawPassword")
      .sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getStudentDetail = async (req, res) => {
  try {
    const { student_id } = req.params;
    const student = await User.findById(student_id)
      .select("-password -rawPassword")
      .populate({
        path: "subscribedCourses.courseId",
        select: "title thumbnail price",
      });

    if (!student) return res.status(404).json({ message: "Student not found" });

    const studentProgress = await Progress.find({ student: student_id })
      .populate("course", "title")
      .lean();

    res.json({
      profile: student,
      progressReports: studentProgress,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deactivateStudent = async (req, res) => {
  try {
    const { student_id } = req.params;
    const student = await User.findById(student_id);

    if (!student) return res.status(404).json({ message: "Student not found" });

    if (student.role !== "student") {
      return res
        .status(403)
        .json({ message: "Cannot deactivate admin or owner accounts" });
    }

    student.isActive = false;
    await student.save();

    res.json({
      message: `Student ${student.FirstName} has been deactivated.`,
      student: {
        _id: student._id,
        email: student.email,
        isActive: student.isActive,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const uploadResource = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    let type = "file";
    const mime = req.file.mimetype.toLowerCase();
    if (mime.startsWith("video")) type = "video";
    else if (mime.includes("pdf")) type = "pdf";
    else if (mime.startsWith("image")) type = "image";

    res.status(200).json({
      message: "Upload successful",
      url: req.file.path,
      type: type,
      originalName: req.file.originalname,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateStudentDetail = async (req, res) => {
  try {
    const { student_id } = req.params;
    const requesterRole = req.user.role;
    const updates = { ...req.body };

    if (req.file) updates.photo = req.file.path;

    const targetUser = await User.findById(student_id);
    if (!targetUser)
      return res.status(404).json({ message: "Student not found" });

    if (!canManageTarget(requesterRole, targetUser.role)) {
      return res
        .status(403)
        .json({
          message: `Access denied: You cannot update a ${targetUser.role}`,
        });
    }

    if (
      updates.role &&
      requesterRole === "admin" &&
      updates.role !== "student"
    ) {
      return res
        .status(403)
        .json({ message: "Admins cannot promote users to Admin/Owner" });
    }

    const allowedUpdates = [
      "FirstName",
      "LastName",
      "phoneNumber",
      "isActive",
      "role",
      "photo",
    ];
    allowedUpdates.forEach((field) => {
      if (updates[field] !== undefined) targetUser[field] = updates[field];
    });

    await targetUser.save();
    res.json({ message: "Student details updated", user: targetUser });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Server error updating student", error: err.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { student_id } = req.params;
    const student = await User.findById(student_id);

    if (!student) return res.status(404).json({ message: "Student not found" });

    if (student.role !== "student") {
      return res
        .status(403)
        .json({
          message: "Access Denied: You can only delete Student accounts.",
        });
    }

    await student.deleteOne();
    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Server error deleting student", error: err.message });
  }
};
