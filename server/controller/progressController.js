import Progress from "../Model/progress.js";
import Lesson from "../Model/lesson.js";
import Module from "../Model/module.js";

// @desc    Mark a lesson as completed
// @route   POST /api/progress/lessons/:lessonId
export const markLessonComplete = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user.id;

    // 1. Find the lesson and its module to get course ID
    const lesson = await Lesson.findById(lessonId).populate("module");

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const courseId = lesson.module.course;

    // 2. Find or Create the Progress document for this Student + Course
    let progress = await Progress.findOne({
      student: userId,
      course: courseId,
    });

    if (!progress) {
      progress = new Progress({
        student: userId,
        course: courseId,
        completedLessons: [],
        percentCompleted: 0,
      });
    }

    // 3. Add lesson to completed list if not already there
    if (!progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);

      // --- 4. Recalculate Percentage ---
      // First, find all modules in this course
      const modules = await Module.find({ course: courseId }).select("_id");
      const moduleIds = modules.map((m) => m._id);

      // Count total lessons in this course
      const totalLessons = await Lesson.countDocuments({
        module: { $in: moduleIds },
      });

      if (totalLessons > 0) {
        progress.percentCompleted = Math.round(
          (progress.completedLessons.length / totalLessons) * 100
        );
      }

      await progress.save();
    }

    res.json({
      message: "Lesson marked completed",
      percentCompleted: progress.percentCompleted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get progress for all enrolled courses
// @route   GET /api/progress/courses
export const getStudentProgress = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all progress records for this student
    const progressRecords = await Progress.find({ student: userId })
      .populate({
        path: "course",
        select: "title thumbnail", // Only get title and image
      })
      .lean();

    // Format the response
    const response = progressRecords.map((p) => ({
      courseId: p.course._id,
      title: p.course.title,
      thumbnail: p.course.thumbnail,
      percentCompleted: p.percentCompleted,
      completedLessonsCount: p.completedLessons.length,
    }));

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getModuleProgress = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.user.id;

    // 1. Get all lessons in this module to calculate total
    const moduleLessons = await Lesson.find({ module: moduleId }).select("_id");
    const totalLessons = moduleLessons.length;

    // Convert to strings for comparison
    const moduleLessonIds = moduleLessons.map((l) => l._id.toString());

    if (totalLessons === 0) {
      return res.json({
        moduleId,
        percentCompleted: 0,
        completedCount: 0,
        totalLessons: 0,
      });
    }

    // 2. Find the course ID (to locate the correct Progress record)
    const module = await Module.findById(moduleId);
    if (!module) return res.status(404).json({ message: "Module not found" });

    // 3. Get User's Progress record for this Course
    const progress = await Progress.findOne({
      student: userId,
      course: module.course,
    });

    if (!progress) {
      return res.json({
        moduleId,
        percentCompleted: 0,
        completedCount: 0,
        totalLessons,
      });
    }

    // 4. Count completed lessons in this module
    const completedCount = progress.completedLessons.filter((completedId) =>
      moduleLessonIds.includes(completedId.toString())
    ).length;

    const percent = Math.round((completedCount / totalLessons) * 100);

    res.json({
      moduleId,
      moduleTitle: module.title,
      percentCompleted: percent,
      completedCount,
      totalLessons,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
