import crypto from "crypto";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import { sendEnrollmentEmail } from "../utils/emailService.js";
import Subscription from "../Model/subscription.js";
import Module from "../Model/module.js";
import SubModule from "../Model/subModule.js";
import Lesson from "../Model/lesson.js";
import Progress from "../Model/progress.js";
import cloudinary from "../config/cloudinary.js"; // Import Cloudinary

const bunnyStreamUploadUrl = "https://video.bunnycdn.com/tusupload";

const getBunnyStreamPlaybackUrl = (videoId) => {
  const pullZone = process.env.BUNNY_STREAM_PULL_ZONE ||
    `vz-${process.env.BUNNY_STREAM_LIBRARY_ID}.b-cdn.net`;
  return pullZone ? `https://${pullZone}/${videoId}/playlist.m3u8` : null;
};

// @desc Generate a short-lived TUS upload authorization for Bunny Stream.
export const createBunnyStreamUpload = async (req, res) => {
  try {
    const bunnyStreamLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const bunnyStreamApiKey = process.env.BUNNY_STREAM_API_KEY;
    if (!bunnyStreamLibraryId || !bunnyStreamApiKey) {
      return res.status(500).json({ message: "Bunny Stream is not configured on the server." });
    }

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "Video title is required." });

    const bunnyResponse = await fetch(
      `https://video.bunnycdn.com/library/${bunnyStreamLibraryId}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: bunnyStreamApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      },
    );

    if (!bunnyResponse.ok) {
      const details = await bunnyResponse.text();
      return res.status(502).json({ message: `Bunny Stream video creation failed: ${details}` });
    }

    const video = await bunnyResponse.json();
    const videoId = video.guid;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const signature = crypto
      .createHash("sha256")
      .update(`${bunnyStreamLibraryId}${bunnyStreamApiKey}${expiresAt}${videoId}`)
      .digest("hex");

    res.json({
      videoId,
      libraryId: bunnyStreamLibraryId,
      uploadUrl: bunnyStreamUploadUrl,
      authorizationSignature: signature,
      authorizationExpire: expiresAt,
      playbackUrl: getBunnyStreamPlaybackUrl(videoId),
    });
  } catch (err) {
    console.error("Bunny Stream upload initialization error:", err);
    res.status(500).json({ message: err.message || "Unable to initialize Bunny Stream upload." });
  }
};

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
      await sendEnrollmentEmail({
        student,
        course,
        expiresAt,
        isOneTime: false
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

    // 1. Find all submodules
    const subModules = await SubModule.find({ module: moduleId });
    const subModuleIds = subModules.map(sm => sm._id);

    // 2. Delete lessons in those submodules
    if (subModuleIds.length > 0) {
      await Lesson.deleteMany({ subModule: { $in: subModuleIds } });
    }

    // 3. (Legacy direct mapping removal - lessons strictly sit in subModules now)

    // 4. Delete the subModules
    await SubModule.deleteMany({ module: moduleId });
    
    // 5. Delete the module
    await module.deleteOne();

    res.json({ message: "Module, its SubModules, and all related Lessons deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// --- 3.5. SUB-MODULE MANAGEMENT (Topics/SubTopics) ---

// @desc    Add a SubModule to a Module
export const addSubModule = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { title, order, parentSubModule } = req.body;

    if (!title) return res.status(400).json({ message: "SubModule title is required" });

    const module = await Module.findById(moduleId);
    if (!module) return res.status(404).json({ message: "Parent Module not found" });

    const newSubModule = await SubModule.create({
      module: moduleId,
      title,
      order: order || 0,
      parentSubModule: parentSubModule || null
    });

    res.status(201).json(newSubModule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update a SubModule
export const updateSubModule = async (req, res) => {
  try {
    const { subModuleId } = req.params;
    const { title, order, parentSubModule } = req.body;

    const subMod = await SubModule.findById(subModuleId);
    if (!subMod) return res.status(404).json({ message: "SubModule not found" });

    if (title) subMod.title = title;
    if (order !== undefined) subMod.order = order;
    if (parentSubModule !== undefined) subMod.parentSubModule = parentSubModule === "" ? null : parentSubModule;

    await subMod.save();
    res.json(subMod);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a SubModule
export const deleteSubModule = async (req, res) => {
  try {
    const { subModuleId } = req.params;
    const subMod = await SubModule.findById(subModuleId);
    if (!subMod) return res.status(404).json({ message: "SubModule not found" });

    // Delete lessons inside this subModule
    await Lesson.deleteMany({ subModule: subModuleId });

    await subMod.deleteOne();
    res.json({ message: "SubModule and its lessons deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- 4. LESSON MANAGEMENT ---

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const userRegion = process.env.BUNNY_STORAGE_REGION || "sg";
const s3Region = userRegion.toLowerCase() === 'de' ? 'fsn1' : userRegion;

const s3Client = new S3Client({
  endpoint: process.env.BUNNY_STORAGE_ENDPOINT || "https://sg.storage.bunnycdn.com",
  region: s3Region,
  forcePathStyle: true, // CRITICAL for Bunny.net S3 API compatibility
  credentials: {
    accessKeyId: process.env.BUNNY_STORAGE_ZONE || "meetapp-storage",
    secretAccessKey: process.env.BUNNY_STORAGE_API_KEY || "79daa380-5a80-44bc-bac6349f68f8-2880-479b"
  }
});

// @desc    Generate Presigned URL for Bunny.net Direct Upload
export const generatePresignedUrl = async (req, res) => {
  try {
    const { filename, filetype } = req.body;
    
    if (!filename) {
      return res.status(400).json({ message: "Filename is required" });
    }

    const uniqueFilename = `${Date.now()}_${filename.replace(/\s+/g, "_")}`;
    const key = `academy_files/${uniqueFilename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.BUNNY_STORAGE_ZONE || "meetapp-storage",
      Key: key,
      ContentType: filetype || "application/octet-stream",
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const finalUrl = `https://${process.env.BUNNY_PULL_ZONE || 'meetapp-storage.b-cdn.net'}/${key}`;

    res.json({ presignedUrl, finalUrl });
  } catch (err) {
    console.error("Presigned URL Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create a new Lesson (Video/PDF)
export const createLesson = async (req, res) => {
  try {
    const {
      subModuleId, title, isFree, duration, order, category, type: requestedType,
      contentUrl: bodyContentUrl, videoProvider, bunnyVideoId, bunnyLibraryId,
    } = req.body;
    const file = req.file;

    if (!subModuleId || !title || (!file && !bodyContentUrl)) {
      return res
        .status(400)
        .json({ message: "SubModule ID, Title, and File/URL are required" });
    }

    let type = requestedType || "text";
    let finalContentUrl = "";
    let autoDuration = 0;
    
    // Determine source and type
    const sourcePath = file ? file.originalname.toLowerCase() : (bodyContentUrl || "").toLowerCase();
    const mime = file ? file.mimetype.toLowerCase() : "";

    if (
      type === "video" ||
      mime.startsWith("video/") ||
      sourcePath.endsWith(".mp4") ||
      sourcePath.endsWith(".mkv") ||
      sourcePath.endsWith(".mov")
    ) {
      type = "video";
      
      // Auto-fetch duration if it's a new file and duration not provided
      if (file && (!duration || duration == 0)) {
        try {
          const videoDetails = await cloudinary.api.resource(file.filename, { 
            resource_type: "video",
            image_metadata: true 
          });
          if (videoDetails && videoDetails.duration) {
            autoDuration = Math.floor(videoDetails.duration);
          }
        } catch (cloudErr) {
          console.error("Failed to fetch video duration from Cloudinary:", cloudErr.message);
        }
      }
    } else if (type !== "video" && (mime.includes("pdf") || sourcePath.endsWith(".pdf"))) {
      type = "pdf";
    }

    finalContentUrl = file ? file.path : bodyContentUrl;

    const newLesson = await Lesson.create({
      subModule: subModuleId, 
      title,
      type,
      category: category || "Other",
      contentUrl: finalContentUrl,
      videoProvider: videoProvider || "storage",
      bunnyVideoId,
      bunnyLibraryId,
      isFree: isFree === "true" || isFree === true,
      duration: Number(duration) || autoDuration || 0,
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
    const {
      title, isFree, order, category, subModuleId, type: requestedType,
      contentUrl: bodyContentUrl, videoProvider, bunnyVideoId, bunnyLibraryId,
    } = req.body;

    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    if (title) lesson.title = title;
    if (category) lesson.category = category;
    if (subModuleId) lesson.subModule = subModuleId;
    
    if (isFree !== undefined)
      lesson.isFree = isFree === "true" || isFree === true;
    if (order !== undefined) lesson.order = order;

    if (req.file || bodyContentUrl) {
      let type = requestedType || "text";
      const sourceFile = req.file ? req.file.originalname.toLowerCase() : (bodyContentUrl || "").toLowerCase();
      const mime = req.file ? req.file.mimetype.toLowerCase() : "";

      if (
        type === "video" ||
        mime.startsWith("video/") ||
        sourceFile.endsWith(".mp4") ||
        sourceFile.endsWith(".mkv") ||
        sourceFile.endsWith(".mov")
      ) {
        type = "video";
        if (req.file) {
          try {
              const videoDetails = await cloudinary.api.resource(req.file.filename, { 
              resource_type: "video",
              image_metadata: true 
              });
              if (videoDetails && videoDetails.duration) {
              lesson.duration = videoDetails.duration;
              }
          } catch (cloudErr) {
              console.error("Failed to fetch video duration on update:", cloudErr.message);
          }
        }
      } else if (mime.includes("pdf") || sourceFile.endsWith(".pdf")) {
        type = "pdf";
      }

      lesson.contentUrl = req.file ? req.file.path : bodyContentUrl;
      lesson.type = type;
      if (videoProvider) lesson.videoProvider = videoProvider;
      if (bunnyVideoId) lesson.bunnyVideoId = bunnyVideoId;
      if (bunnyLibraryId) lesson.bunnyLibraryId = bunnyLibraryId;
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
    const students = await User.find({ role: "student" }).sort({ createdAt: -1 });
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
