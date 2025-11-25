import Progress from "../Model/progress.js";
import User from "../Model/userSchema.js";
import Quiz from "../Model/quiz.js";

// @desc    Get Student Performance (Quiz Scores)
// @route   GET /api/reports/performance
export const getPerformanceReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const progress = await Progress.find({ student: userId }).populate(
      "quizScores.quiz"
    );

    let totalQuizzes = 0;
    let totalScore = 0;
    let totalMaxScore = 0;

    progress.forEach((p) => {
      p.quizScores.forEach((q) => {
        totalQuizzes++;
        totalScore += q.score;
        totalMaxScore += q.totalMarks;
      });
    });

    const average = totalQuizzes > 0 ? (totalScore / totalMaxScore) * 100 : 0;

    res.json({
      quizzesTaken: totalQuizzes,
      totalScore,
      averagePercentage: Math.round(average),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get Engagement Metrics (Login/Activity)
// @route   GET /api/reports/engagement
export const getEngagementMetrics = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    res.json({
      lastLogin: user.lastLogin,
      joinDate: user.createdAt,
      status: user.isActive ? "Active" : "Inactive",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get Course Performance Overview (Admin)
// @route   GET /api/admin/reports/course-performance
export const getAdminCourseReports = async (req, res) => {
  try {
    const reports = await Progress.aggregate([
      {
        $group: {
          _id: "$course",
          avgCompletion: { $avg: "$percentCompleted" },
          totalStudents: { $sum: 1 },
        },
      },
    ]);
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getStudentActivityReport = async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ role: "student" });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeStudents = await User.countDocuments({
      role: "student",
      lastLogin: { $gte: sevenDaysAgo },
    });

    const totalLessonsCompleted = await Progress.aggregate([
      { $project: { count: { $size: "$completedLessons" } } },
      { $group: { _id: null, total: { $sum: "$count" } } },
    ]);

    res.json({
      totalStudents,
      activeStudentsLast7Days: activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      totalLessonsCompleted: totalLessonsCompleted[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get Quiz Performance (Average, Distribution)
// @route   GET /api/admin/reports/quiz-performance
export const getQuizPerformanceReport = async (req, res) => {
  try {
    const stats = await Progress.aggregate([
      { $unwind: "$quizScores" },
      {
        $group: {
          _id: "$quizScores.quiz",
          averageScore: { $avg: "$quizScores.score" },
          attempts: { $sum: 1 },
          highestScore: { $max: "$quizScores.score" },
          lowestScore: { $min: "$quizScores.score" },
        },
      },
      {
        $lookup: {
          from: "quizzes",
          localField: "_id",
          foreignField: "_id",
          as: "quizDetails",
        },
      },
      { $unwind: "$quizDetails" },
      {
        $project: {
          quizTitle: "$quizDetails.title",
          averageScore: { $round: ["$averageScore", 1] },
          attempts: 1,
          highestScore: 1,
          lowestScore: 1,
        },
      },
    ]);

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
