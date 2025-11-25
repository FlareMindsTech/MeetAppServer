import path from "path";

import { fileURLToPath } from "url";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import ContentGroup from "../Model/module.js";
import ContentFile from "../Model/lesson.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// @desc    Create a new Content Group (a folder)
// @route   POST /api/content/group
// @access  Protected (Owner, Admin)
export const createContentGroup = async (req, res) => {
  try {
    const { courseId, title, order } = req.body;
    if (!courseId || !title) {
      return res
        .status(400)
        .json({ message: "courseId and title are required" });
    }

    const group = await ContentGroup.create({
      course: courseId,
      title,
      order: order || 0,
    });

    res.status(201).json(group);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Create a new Content File (Video, PDF, etc.)
// @route   POST /api/content/file
// @access  Protected (Owner, Admin)
export const createContentFile = async (req, res) => {
  try {
    const { courseId, groupId, title, description, isFree, order } = req.body;
    const contentType = req.body.contentType?.toLowerCase();

    if (!courseId || !title || !contentType) {
      return res
        .status(400)
        .json({ message: "courseId, title, and contentType are required" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Content file is required" });
    }

    // 1. Get the path directly from req.file (it's already correct!)
    // e.g., "uploads\pdfs\1763...pdf"
    // We no longer need any 'fs' or 'uploadDir' logic here
    const relativePath = req.file.path.replace(/\\/g, "/");

    const file = await ContentFile.create({
      course: courseId,
      group: groupId || null,
      title,
      description: description || "",
      contentType: contentType,

      url: `/${relativePath}`,
      isFree: isFree === "true",
      order: order || 0,
    });

    res.status(201).json(file);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};
// @desc    Get all content for a course (for students)
// @route   GET /api/courses/:courseId/content
// @access  Protected (Student)
export const getCourseContent = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;

    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const now = new Date();
    const subscription = student.subscribedCourses.find(
      (sub) => sub.courseId.toString() === courseId && sub.expiresAt > now
    );
    const isSubscribed = !!subscription;

    // -----------------------------------------------------------------
    //  Helper Function to remove URLs if not subscribed
    // -----------------------------------------------------------------
    const cleanFiles = (files) => {
      if (isSubscribed) {
        return files;
      }

      return files.map((file) => {
        if (!file.isFree) {
          file.url = null;
        }
        return file;
      });
    };

    let topLevelFiles = await ContentFile.find({
      course: courseId,
      group: null,
    })
      .sort("order")
      .lean();

    let groups = await ContentGroup.find({ course: courseId })
      .sort("order")
      .lean();

    const processedGroups = await Promise.all(
      groups.map(async (group) => {
        let filesInGroup = await ContentFile.find({ group: group._id })
          .sort("order")
          .lean();

        const freeFilesCount = filesInGroup.filter((f) => f.isFree).length;

        return {
          ...group,
          type: "Group",
          fileCount: filesInGroup.length,
          freeContentCount: freeFilesCount,

          files: cleanFiles(filesInGroup),
        };
      })
    );

    const processedFiles = cleanFiles(topLevelFiles).map((file) => ({
      ...file,
      type: "File",
    }));

    const combinedContent = [...processedGroups, ...processedFiles];
    combinedContent.sort((a, b) => a.order - b.order);

    res.json({
      isSubscribed: isSubscribed,
      content: combinedContent,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

export const updateContentGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, order } = req.body;

    const group = await ContentGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: "Content group not found" });
    }

    group.title = title || group.title;
    group.order = order ?? group.order; // Allow setting order to 0

    const updatedGroup = await group.save();
    res.json(updatedGroup);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a Content Group (folder)
// @route   DELETE /api/content/group/:id
// @access  Protected (Owner, Admin)
export const deleteContentGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await ContentGroup.findById(id);

    if (!group) {
      return res.status(44).json({ message: "Content group not found" });
    }

    await ContentFile.deleteMany({ group: group._id });

    await group.deleteOne();

    res.json({ message: "Group and all its files deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

// --- Content File Functions ---

// @desc    Update a Content File
// @route   PUT /api/content/file/:id
// @access  Protected (Owner, Admin)
export const updateContentFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, isFree, order, groupId, contentType } =
      req.body;

    const file = await ContentFile.findById(id);
    if (!file) {
      return res.status(404).json({ message: "Content file not found" });
    }

    file.title = title || file.title;
    file.description = description || file.description;
    file.order = order ?? file.order;
    file.group = groupId || file.group;
    file.isFree = isFree === "true";

    if (req.file) {
      const relativePath = req.file.path.replace(/\\/g, "/");
      file.url = `/${relativePath}`;
      file.contentType = contentType?.toLowerCase() || file.contentType;
    }

    const updatedFile = await file.save();
    res.json(updatedFile);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a Content File
// @route   DELETE /api/content/file/:id
// @access  Protected (Owner, Admin)
export const deleteContentFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await ContentFile.findById(id);

    if (!file) {
      return res.status(404).json({ message: "Content file not found" });
    }

    // Delete the file entry from the database
    await file.deleteOne();

    res.json({ message: "File deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};
