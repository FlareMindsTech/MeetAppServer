// File: server/controller/adminController.js

import Course from "../Model/course.js";
import Module from "../Model/module.js";
import Lesson from "../Model/lesson.js";
import Progress from "../Model/progress.js";
import User from "../Model/userSchema.js";
import path from "path";
import fs from "fs";

// @desc    Add a Module to a Course
// @route   POST /api/admin/courses/:id/modules
export const addModule = async (req, res) => {
  try {
    const { id } = req.params; // Course ID
    const { title, order } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Module title is required" });
    }

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
// @route   PUT /api/admin/modules/:moduleId/update
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
// @route   DELETE /api/admin/modules/:moduleId/delete
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

// @desc    Create a new Lesson (Video/PDF)
// @route   POST /api/admin/lessons/create
export const createLesson = async (req, res) => {
  try {
    const { moduleId, title, isFree, duration, order } = req.body;
    const file = req.file; 

    if (!moduleId || !title || !file) {
      return res.status(400).json({ message: "Module ID, Title, and File are required" });
    }

    let type = "text";
    let folder = "files";

    if (file.mimetype.startsWith("video")) {
        type = "video";
        folder = "videos";
    } else if (file.mimetype.includes("pdf")) {
        type = "pdf";
        folder = "pdfs";
    } else if (file.mimetype.startsWith("image")) {
        type = "image";
        folder = "thumbnails";
    }

    // FIX: Generate the web-accessible URL path
    // Note: We use forward slashes '/' for URLs, even on Windows
    const relativePath = `uploads/${folder}/${path.basename(file.path)}`;

    const newLesson = await Lesson.create({
      module: moduleId,
      title,
      type,
      contentUrl: `/${relativePath}`, // Result: /uploads/videos/123_video.mp4
      isFree: isFree === 'true',
      duration: duration || 0,
      order: order || 0
    });

    res.status(201).json(newLesson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update a Lesson
// @route   PUT /api/admin/lessons/:id/update
export const updateLesson = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, isFree, order } = req.body;

    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    if (title) lesson.title = title;
    if (isFree !== undefined) lesson.isFree = isFree === "true";
    if (order !== undefined) lesson.order = order;

    if (req.file) {
      let type = "text";
      if (req.file.mimetype.startsWith("video")) type = "video";
      if (req.file.mimetype.includes("pdf")) type = "pdf";

      const relativePath = path
        .join(
          "uploads",
          type === "video" ? "videos" : "pdfs",
          path.basename(req.file.path)
        )
        .replace(/\\/g, "/");

      lesson.contentUrl = `/${relativePath}`;
      lesson.type = type;
    }

    await lesson.save();
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a Lesson
// @route   DELETE /api/admin/lessons/:id/delete
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

export const getAllStudents = async (req, res) => {
  try {
    
    const students = await User.find({ role: "student" })
      .select("-password -rawPassword") // Hide passwords
      .sort({ createdAt: -1 });

    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    View student profile / progress
// @route   GET /admin/students/:student_id
export const getStudentDetail = async (req, res) => {
  try {
    const { student_id } = req.params;

    const student = await User.findById(student_id)
      .select("-password -rawPassword")
      .populate({
        path: "subscribedCourses.courseId",
        select: "title thumbnail price",
      });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const studentProgress = await Progress.find({ student: student_id })
      .populate("course", "title")
      .lean();

    res.json({
      profile: student,
      progressReports: studentProgress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Deactivate a Student Account
// @route   POST /api/admin/students/:student_id/deactivate
export const deactivateStudent = async (req, res) => {
  try {
    const { student_id } = req.params;

    const student = await User.findById(student_id);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (student.role !== "student") {
      return res
        .status(403)
        .json({ message: "Cannot deactivate admin or owner accounts" });
    }

    student.isActive = false;
    await student.save();

    res.json({
      message: `Student ${student.FirstName} has been deactivated successfully.`,
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
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    let type = "file";
    if (req.file.mimetype.startsWith("video")) type = "video";
    else if (req.file.mimetype.includes("pdf")) type = "pdf";
    else if (req.file.mimetype.startsWith("image")) type = "image";

    const relativePath = path
      .join(
        "uploads",
        type === "video" ? "videos" : type === "pdf" ? "pdfs" : "images",
        path.basename(req.file.path)
      )
      .replace(/\\/g, "/");

    res.status(200).json({
      message: "Upload successful",
      url: `/${relativePath}`,
      type: type,
      originalName: req.file.originalname,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
