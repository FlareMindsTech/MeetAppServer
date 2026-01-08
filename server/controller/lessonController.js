import Lesson from "../Model/lesson.js";
import User from "../Model/userSchema.js";

// @desc    List of lessons in a module
// @route   GET /api/modules/:moduleId/lessons
export const getModuleLessons = async (req, res) => {
  try {
    const { moduleId } = req.params;

    const userRole = req.user.role;
    const isPrivileged = userRole === "admin" || userRole === "owner";

    const lessons = await Lesson.find({ module: moduleId })
      .sort({ order: 1 })
      .lean();

    const sanitizedLessons = lessons.map((lesson) => {
      const lessonData = {
        _id: lesson._id,
        title: lesson.title,
        type: lesson.type,
        isFree: lesson.isFree,
        duration: lesson.duration,
      };

      if (isPrivileged) {
        lessonData.contentUrl = lesson.contentUrl;
        lessonData.message = "Admin/Owner View: Full Access";
      }

      return lessonData;
    });

    res.json(sanitizedLessons);
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
    const userRole = req.user.role;

    const canBypassSubscription =
      userRole === "admin" || userRole === "owner";

    const lesson = await Lesson.findById(lessonId).populate("module");

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (!lesson.module || !lesson.module.course) {
      console.error("Data Error: Lesson missing module or course link");
      return res.status(500).json({ message: "Lesson data is corrupted." });
    }

    if (lesson.isFree || canBypassSubscription) {
      return res.json(lesson);
    }

    const student = await User.findById(studentId);
    const now = new Date();
    const courseIdToCheck = lesson.module.course.toString();

    const isSubscribed = student.subscribedCourses.find((sub) => {
      if (!sub.courseId) return false;
      return (
        sub.courseId.toString() === courseIdToCheck &&
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

    const lesson = await Lesson.findById(lessonId).populate("module");
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
    if (!lesson.module || !lesson.module.course) {
      return res.status(500).json({ message: "Lesson data corrupted" });
    }

    const courseId = lesson.module.course.toString();

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
