import Lesson from "../Model/lesson.js";
import User from "../Model/userSchema.js";
import Module from "../Model/module.js";

import SubModule from "../Model/subModule.js";

// @desc    List of lessons in a SubModule
// @route   GET /api/submodules/:subModuleId/lessons
export const getSubModuleLessons = async (req, res) => {
  try {
    const { subModuleId } = req.params;

    const userRole = (req.user.role || "").toLowerCase();
    const userId = req.user.id;
    const isPrivileged = userRole === "admin" || userRole === "owner";

    // Fetch SubModule to get Module -> Course ID
    const subModuleDoc = await SubModule.findById(subModuleId).populate("module").lean();
    if (!subModuleDoc || !subModuleDoc.module) {
      return res.status(404).json({ message: "SubModule or Parent Module not found" });
    }
    const courseId = subModuleDoc.module.course.toString();

    let hasAccess = isPrivileged;

    // Check subscription if not privileged
    if (!hasAccess) {
      const student = await User.findById(userId);
      if (student) {
        const now = new Date();
        const isSubscribed = student.subscribedCourses.find((sub) => {
          return (
            sub.courseId &&
            sub.courseId.toString() === courseId &&
            new Date(sub.expiresAt) > now
          );
        });
        if (isSubscribed) hasAccess = true;
      }
    }

    // Helper to sanitize lesson based on access
    const sanitizeLesson = (lesson) => {
      const lessonData = {
        _id: lesson._id,
        title: lesson.title,
        type: lesson.type,
        isFree: lesson.isFree,
        duration: lesson.duration,
        order: lesson.order,
        category: lesson.category,
      };

      // Expose contentUrl if privileged, subscribed, or lesson is free
      if (hasAccess || lesson.isFree) {
        lessonData.contentUrl = lesson.contentUrl;
        lessonData.videoProvider = lesson.videoProvider;
        lessonData.bunnyVideoId = lesson.bunnyVideoId;
        lessonData.bunnyLibraryId = lesson.bunnyLibraryId;
        if (hasAccess) {
          lessonData.message = "Access Granted";
        }
      } else {
        lessonData.contentUrl = null;
        lessonData.message = "Locked";
      }

      if (isPrivileged) {
        lessonData.message = "Admin/Owner View: Full Access";
      }

      return lessonData;
    };

    // 1. Fetch Lessons in SubModule
    const lessons = await Lesson.find({ subModule: subModuleId }).sort({ order: 1 }).lean();

    res.json({
        subModule: subModuleDoc,
        lessons: lessons.map(sanitizeLesson)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};


// @desc    Fetch lesson details (content URL, type)
// @route   GET /api/lessons/:lessonId
export const getLessonDetails = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const studentId = req.user.id;
    const userRole = (req.user.role || "").toLowerCase();

    const canBypassSubscription =
      userRole === "admin" || userRole === "owner";

    // Populate both module and subModule (and their nested course/module references)
    const lesson = await Lesson.findById(lessonId)
      .populate({
        path: "module",
        select: "course",
      })
      .populate({
        path: "subModule",
        populate: {
          path: "module",
          select: "course",
        },
      });

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    // Determine Course ID strictly via SubModule
    let courseId = null;

    if (
      lesson.subModule &&
      lesson.subModule.module &&
      lesson.subModule.module.course
    ) {
      courseId = lesson.subModule.module.course.toString();
    }

    if (!courseId) {
      console.error("Data Error: Lesson missing module/course link", lesson);
      return res.status(500).json({ message: "Lesson data is corrupted." });
    }

    if (lesson.isFree || canBypassSubscription) {
      return res.json(lesson);
    }

    const student = await User.findById(studentId);
    const now = new Date();
    
    const isSubscribed = student.subscribedCourses.find((sub) => {
      if (!sub.courseId) return false;
      return (
        sub.courseId.toString() === courseId &&
        sub.expiresAt > now
      );
    });

    if (isSubscribed) {
      return res.json(lesson);
    } else {
      return res.json({
        _id: lesson._id,
        title: lesson.title,
        type: lesson.type,
        isFree: lesson.isFree,
        contentUrl: null,
        message: "You must purchase the course to view this lesson.",
      });
    }
  } catch (err) {
    console.error("getLessonDetails Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Downloadable content
// @route   GET /api/lessons/:lessonId/download
export const downloadLessonResource = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const studentId = req.user.id;

    const lesson = await Lesson.findById(lessonId).populate({
      path: "subModule",
      populate: { path: "module" }
    });
    if (!lesson) return res.status(404).json({ message: "Resource not found" });

    if (lesson.type !== "pdf") {
      return res
        .status(400)
        .json({ message: "This lesson is not downloadable" });
    }

    // Subscription Check
    const student = await User.findById(studentId);
    const now = new Date();

    // Safety check
    if (!lesson.subModule || !lesson.subModule.module || !lesson.subModule.module.course) {
      return res.status(500).json({ message: "Lesson data corrupted" });
    }

    const courseId = lesson.subModule.module.course.toString();

    const isSubscribed = student.subscribedCourses.find(
      (sub) =>
        sub.courseId &&
        sub.courseId.toString() === courseId &&
        sub.expiresAt > now
    );

    if (lesson.isFree || isSubscribed) {
      return res.json({ downloadUrl: lesson.contentUrl });
    } else {
      return res
        .status(403)
        .json({ message: "Access denied. Please purchase the course." });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
