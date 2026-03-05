import Progress from "../Model/progress.js";
import Lesson from "../Model/lesson.js";
import Module from "../Model/module.js";
import User from "../Model/userSchema.js";
import SubModule from "../Model/subModule.js";

// @desc    Mark a lesson as completed
// @route   POST /api/progress/lessons/:lessonId
export const markLessonComplete = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user.id;

    // 1. Find the lesson and its subModule to get course ID
    const lesson = await Lesson.findById(lessonId)
      .populate({
        path: "subModule",
        populate: { path: "module" }
      });

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    let courseId;
    if (lesson.subModule && lesson.subModule.module && lesson.subModule.module.course) {
      courseId = lesson.subModule.module.course;
    }

    if (!courseId) {
      return res.status(400).json({ message: "Could not determine course for this lesson" });
    }

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

      // Second, find all subModules for these modules
      const subModules = await SubModule.find({ module: { $in: moduleIds } }).select("_id");
      const subModuleIds = subModules.map((s) => s._id);

      // Count total lessons in this course via submodules
      const totalLessons = await Lesson.countDocuments({
        subModule: { $in: subModuleIds }
      });

      if (totalLessons > 0) {
        progress.percentCompleted = Math.round(
          (progress.completedLessons.length / totalLessons) * 100
        );
      } else {
        progress.percentCompleted = 0;
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

    // 1. Get the user's subscribed courses
    const user = await User.findById(userId).populate({
      path: "subscribedCourses.courseId",
      select: "title thumbnail",
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Filter valid subscriptions in case a course was deleted
    const validSubscriptions = user.subscribedCourses.filter(sub => sub.courseId);

    // 2. Find all progress records for this student
    const progressRecords = await Progress.find({ student: userId }).lean();

    // Map progress records by courseId
    const progressMap = {};
    progressRecords.forEach((p) => {
      progressMap[p.course.toString()] = p;
    });

    // 3. Format the response
    const response = validSubscriptions.map((sub) => {
      const course = sub.courseId;
      const progress = progressMap[course._id.toString()];

      return {
        courseId: course._id,
        title: course.title,
        thumbnail: course.thumbnail,
        percentCompleted: progress ? progress.percentCompleted : 0,
        completedLessonsCount: progress ? progress.completedLessons.length : 0,
      };
    });

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

    // 1. Get subModules for this module
    const subModules = await SubModule.find({ module: moduleId }).select("_id");
    const subModuleIds = subModules.map(s => s._id);

    // 2. Get all lessons in this module (via submodule) to calculate total
    const moduleLessons = await Lesson.find({
      subModule: { $in: subModuleIds }
    }).select("_id");
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

    // 3. Find the course ID (to locate the correct Progress record)
    const module = await Module.findById(moduleId);
    if (!module) return res.status(404).json({ message: "Module not found" });

    // 4. Get User's Progress record for this Course
    const progress = await Progress.findOne({
      student: userId,
      course: module.course,
    });

    if (!progress) {
      return res.json({
        moduleId,
        moduleTitle: module.title,
        percentCompleted: 0,
        completedCount: 0,
        totalLessons,
      });
    }

    // 5. Count completed lessons in this module
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
