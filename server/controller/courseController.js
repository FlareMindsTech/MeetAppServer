import path from "path";
import fs from "fs";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import transporter from "./transporter.js";
import ContentGroup from "../Model/module.js";
import ContentFile from "../Model/lesson.js";

// --- 1. PUBLIC & STUDENT APIs ---

// @desc    List all courses (Public)
// @route   GET /api/courses
export const getPublicCourses = async (req, res) => {
  try {
    const { type } = req.query;
    let filter = {};

    if (type === "recorded") filter.isLiveCourse = false;
    if (type === "live") filter.isLiveCourse = true;

    const courses = await Course.find(filter)
      .select(
        "title description thumbnail price isLiveCourse duration category"
      )
      .sort({ createdAt: -1 });

    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get Single Course Details with Modules (Public/Student)
// @route   GET /api/courses/:id
export const getCourseDetails = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Fetch "Modules" (ContentGroups) for this course
    const modules = await ContentGroup.find({ course: req.params.id })
      .sort("order")
      .lean();

    // Return course data merged with modules
    res.json({ ...course, modules });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Enroll a student (Manual Subscription / Free Enrollment)
// @route   POST /api/courses/:id/enroll
export const enrollStudent = async (req, res) => {
  try {
    // Use route param for courseId if provided, otherwise body
    const courseId = req.params.id || req.body.courseId;
    const { studentId, durationInDays } = req.body;

    if (!studentId || !courseId) {
      return res
        .status(400)
        .json({ message: "studentId and courseId are required" });
    }

    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Default duration to 365 if not provided
    const validDuration = durationInDays || course.durationInDays || 365;

    // Calculate expiry
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + parseInt(validDuration, 10));

    // Check existing subscription
    const existingSub = student.subscribedCourses.find(
      (sub) => sub.courseId.toString() === courseId
    );

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

    // Send Email
    try {
      const expiryDateString = expiresAt.toLocaleDateString("en-US");
      await transporter.sendMail({
        from: `"Admin" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: `Enrollment Successful: ${course.title}`,
        html: `
          <p>Hello <b>${student.FirstName}</b>,</p>
          <p>You have been enrolled in <b>${course.title}</b>.</p>
          <p>Access expires on: <b>${expiryDateString}</b></p>
          <p>Happy Learning!</p>
        `,
      });
    } catch (emailErr) {
      console.error("Email failed:", emailErr);
    }

    res.status(200).json({ message: "Enrolled successfully", expiresAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- 2. ADMIN MANAGEMENT APIs ---

// @desc    Create a new course
// @route   POST /api/courses
export const createCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      price,
      createdBy,
      duration,
      isLiveCourse,
      durationInDays,
    } = req.body;

    if (
      !title ||
      !description ||
      !category ||
      !price ||
      !duration ||
      !durationInDays
    ) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Thumbnail image is required" });
    }

    const relativePath = path
      .join("uploads", "thumbnails", path.basename(req.file.path))
      .replace(/\\/g, "/");

    const course = await Course.create({
      title,
      description,
      category,
      price: Number(price),
      createdBy,
      duration,
      thumbnail: `/${relativePath}`,
      isLiveCourse: isLiveCourse === "true",
      durationInDays: Number(durationInDays),
    });

    return res.status(201).json(course);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Update a course
// @route   PUT /api/courses/:id
export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      price,
      createdBy,
      duration,
      isLiveCourse,
      durationInDays,
    } = req.body;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    course.title = title || course.title;
    course.description = description || course.description;
    course.category = category || course.category;
    course.price = Number(price) || course.price;
    course.createdBy = createdBy || course.createdBy;
    course.duration = duration || course.duration;
    course.isLiveCourse = isLiveCourse === "true";
    course.durationInDays = Number(durationInDays) || course.durationInDays;

    if (req.file) {
      // Delete old thumbnail logic can go here
      const relativePath = path
        .join("uploads", "thumbnails", path.basename(req.file.path))
        .replace(/\\/g, "/");
      course.thumbnail = `/${relativePath}`;
    }

    const updatedCourse = await course.save();
    res.json(updatedCourse);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a course
// @route   DELETE /api/courses/:id
export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Cleanup
    await ContentFile.deleteMany({ course: course._id });
    await ContentGroup.deleteMany({ course: course._id });
    await User.updateMany(
      { "subscribedCourses.courseId": course._id },
      { $pull: { subscribedCourses: { courseId: course._id } } }
    );

    await course.deleteOne();
    res.json({ message: "Course deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get all courses with full content (Admin Dashboard)
// @route   GET /api/courses/admin/all
export const getAllCourses = async (req, res) => {
  try {
    // 1. Get courses
    const courses = await Course.find({}).sort({ createdAt: -1 }).lean();

    // 2. Loop through courses
    const coursesWithContent = await Promise.all(
      courses.map(async (course) => {
        // A. Get Modules (ContentGroups)
        const groups = await ContentGroup.find({ course: course._id })
          .sort("order")
          .lean();

        // B. Loop through Modules to get Lessons (ContentFiles) <-- THIS IS THE MISSING PART
        const modulesWithLessons = await Promise.all(
          groups.map(async (group) => {
            const lessons = await ContentFile.find({ module: group._id })
              .sort("order")
              .lean();

            // Return the module WITH its lessons
            return {
              ...group,
              lessons: lessons,
            };
          })
        );

        return {
          ...course,
          modules: modulesWithLessons,
        };
      })
    );

    res.json(coursesWithContent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// @desc    Get purchased students
// @route   GET /api/courses/:courseId/purchased-students
export const getCoursePurchasedStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!courseId)
      return res.status(400).json({ message: "courseId is required" });

    const students = await User.find({ "subscribedCourses.courseId": courseId })
      .select("FirstName LastName email subscribedCourses")
      .lean();

    const result = students.map((s) => {
      const sub = s.subscribedCourses.find(
        (c) => String(c.courseId) === String(courseId)
      );
      return {
        username: `${s.FirstName || ""} ${s.LastName || ""}`.trim(),
        email: s.email,
        subscribedAt: sub?.subscribedAt,
        expiresAt: sub?.expiresAt,
      };
    });

    return res.json({
      courseId,
      totalStudents: result.length,
      students: result,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getCourseModules = async (req, res) => {
  try {
    const { id } = req.params;

    // Find all modules (ContentGroups) linked to this course
    const modules = await ContentGroup.find({ course: id })
      .sort({ order: 1 })
      .lean();

    if (!modules || modules.length === 0) {
      return res
        .status(404)
        .json({ message: "No modules found for this course" });
    }

    res.json(modules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
