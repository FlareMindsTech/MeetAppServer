import Quiz from "../Model/quiz.js";
import Progress from "../Model/progress.js";
import Module from "../Model/module.js";

// @desc    Create a new Quiz (Admin)
// @route   POST /api/admin/quiz/create
//admin controller
export const createQuiz = async (req, res) => {
  try {
    const { moduleId, title, questions } = req.body;

    if (!moduleId || !title || !questions || questions.length === 0) {
      return res
        .status(400)
        .json({ message: "Module ID, title, and questions are required" });
    }

    const existingQuiz = await Quiz.findOne({ module: moduleId });
    if (existingQuiz) {
      return res
        .status(400)
        .json({ message: "A quiz already exists for this module" });
    }

    const quiz = await Quiz.create({
      module: moduleId,
      title,
      questions,
    });

    res.status(201).json({ message: "Quiz created successfully", quiz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getAllQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({})
      .populate("module", "title")
      .sort({ createdAt: -1 });

    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Add questions to an existing quiz
// @route   POST /api/admin/quiz/:quizId/questions
export const addQuestionsToQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questions } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ message: "Questions array is required" });
    }

    quiz.questions.push(...questions);
    await quiz.save();

    res.json({ message: "Questions added successfully", quiz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update Quiz Metadata (Title, Module)
// @route   PUT /api/admin/quiz/:quizId/update
export const updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { title, moduleId } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    if (title) quiz.title = title;
    if (moduleId) quiz.module = moduleId;

    await quiz.save();
    res.json({ message: "Quiz updated successfully", quiz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a Quiz
// @route   DELETE /api/admin/quiz/:quizId/delete
export const deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const quiz = await Quiz.findByIdAndDelete(quizId);

    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    res.json({ message: "Quiz deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//student controllers

export const getModuleQuiz = async (req, res) => {
  try {
    const { moduleId } = req.params;

    const quiz = await Quiz.findOne({ module: moduleId });

    if (!quiz) {
      return res.status(404).json({ message: "No quiz found for this module" });
    }

    // SECURITY: We must hide the 'correctOption' before sending to frontend
    // otherwise users can inspect the network tab and see the answers.
    const sanitizedQuestions = quiz.questions.map((q) => ({
      _id: q._id,
      questionText: q.questionText,
      options: q.options, // The array of choices
      marks: q.marks,
      // correctOption is INTENTIONALLY OMITTED
    }));

    res.json({
      _id: quiz._id,
      title: quiz.title,
      module: quiz.module,
      questions: sanitizedQuestions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Submit quiz answers and calculate score
// @route   POST /api/quiz/:quizId/submit
export const submitQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { answers } = req.body;
    // Expected body format: { answers: [{ questionId: "...", selectedOption: 1 }] }
    const studentId = req.user.id;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    let score = 0;
    let totalMarks = 0;

    // 1. Calculate Score
    quiz.questions.forEach((question) => {
      totalMarks += question.marks;

      // Find the user's answer for this specific question
      // We look for a matching string ID
      const userAnswer = answers.find(
        (a) => a.questionId === question._id.toString()
      );

      // Compare: User's selection index vs Database correct index
      if (userAnswer && userAnswer.selectedOption === question.correctOption) {
        score += question.marks;
      }
    });

    // 2. Find the Course ID (Quiz -> Module -> Course)
    const module = await Module.findById(quiz.module);
    if (!module) return res.status(404).json({ message: "Module not found" });

    const courseId = module.course;

    // 3. Update Student Progress
    let progress = await Progress.findOne({
      student: studentId,
      course: courseId,
    });

    if (!progress) {
      // Create new progress entry if it doesn't exist
      progress = new Progress({
        student: studentId,
        course: courseId,
        completedLessons: [],
        quizScores: [],
      });
    }

    // Remove any previous score for this specific quiz (so they can retake it)
    progress.quizScores = progress.quizScores.filter(
      (q) => q.quiz.toString() !== quizId
    );

    // Add the new score
    progress.quizScores.push({
      quiz: quizId,
      score: score,
      totalMarks: totalMarks,
    });

    await progress.save();

    res.json({
      message: "Quiz submitted successfully",
      score,
      totalMarks,
      passed: score >= totalMarks * 0.5, // Example: Pass if > 50%
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Fetch previous quiz result / score
// @route   GET /api/quiz/:quizId/result
export const getQuizResult = async (req, res) => {
  try {
    const { quizId } = req.params;
    const studentId = req.user.id;

    const progress = await Progress.findOne({
      student: studentId,
      "quizScores.quiz": quizId,
    });

    if (!progress) {
      return res.status(404).json({ message: "No result found for this quiz" });
    }

    // Extract the specific quiz score from the array
    const result = progress.quizScores.find(
      (q) => q.quiz.toString() === quizId
    );

    res.json({
      quizId: result.quiz,
      score: result.score,
      totalMarks: result.totalMarks,
      dateTaken: progress.updatedAt, // Approximate date
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
