// import path from "path";
// import fs from "fs";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import transporter from "./transporter.js";
import Subscription from "../Model/subscription.js"; 
import Module from "../Model/module.js";  
import Lesson from "../Model/lesson.js"; 
import Meeting from "../Model/meet.js";
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
      .select("title description thumbnail price isLiveCourse duration category")
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
    const studentId = req.user?.id;
    const course = await Course.findById(req.params.id).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 1. Fetch Modules for this course
    const modules = await Module.find({ course: req.params.id })
      .sort("order")
      .lean();

    // Fetch Lessons for each Module
    const modulesWithLessons = await Promise.all(
      modules.map(async (module) => {
        const lessons = await Lesson.find({ module: module._id })
          .sort("order")
          .lean();
        return { ...module, lessons };
      })
    );

    // 2. Fetch Live Meetings for this course
    const meetings = await Meeting.find({ courseId: req.params.id })
      .sort({ date: 1, startTime: 1 })
      .lean();

    // 3. Security Check: Is the user authorized to see the URL?
    let isSubscribed = false;
    if (studentId) {
        const student = await User.findById(studentId);
        const now = new Date();
        isSubscribed = student?.subscribedCourses?.some(
            (sub) => sub.courseId.toString() === req.params.id && sub.expiresAt > now
        );
    }

    const isAdmin = ["admin", "owner"].includes(req.user?.role?.toLowerCase());

    const securedMeetings = meetings.map(m => {
        // Only return meetingUrl if subscribed or admin
        if (!isSubscribed && !isAdmin) {
            const { meetingUrl, ...rest } = m; 
            return { ...rest, meetingUrl: null }; 
        }
        return m;
    });

    res.json({ 
      ...course, 
      modules: modulesWithLessons, 
      liveMeetings: securedMeetings || [] 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Enroll a student (Manual Subscription / Free Enrollment)
// @route   POST /api/courses/:id/enroll
export const enrollStudent = async (req, res) => {
  try {
    const courseId = req.params.id;
    const studentId = req.user.id;

    // 1. Check if Course Exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 2. SECURITY CHECK: Is the course actually free?
    if (course.price > 0) {
      return res.status(403).json({
        message: "This is a paid course. Please proceed to payment.",
      });
    }

    // 3. Find Student
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    // 4. Check if already enrolled
    const existingSub = student.subscribedCourses.find(
      (sub) => sub.courseId.toString() === courseId
    );

    const now = new Date();

    if (existingSub) {
      if (existingSub.expiresAt > now) {
        return res.status(400).json({ message: "You are already enrolled." });
      }
    }

    // 5. Calculate Expiry
    const durationInDays = course.durationInDays || 365;
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));

    // 6. Save Subscription (to user document)
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

    // 7. Create a Subscription record (type = free) for admin visibility
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
      console.error("Could not create subscription record for free enroll:", err);
      // continue anyway (we don't want to fail the entire request for analytics record)
    }

    // 8. SEND EMAIL NOTIFICATION (NEW ADDITION)
    try {
      const info = await transporter.sendMail({
        from: `"Admin" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: `Enrollment Confirmed: ${course.title}`,
        html: `
          <p>Hello ${student.FirstName || ""},</p>
          <p>You have been enrolled in <b>${course.title}</b>. Your access is valid until <b>${expiresAt.toLocaleDateString("en-US")}</b>.</p>
        `,
      });
      console.log("Email send result:", info);
    } catch (emailErr) {
      console.error("Email sending failed:", emailErr);
    }

    // -------------------------------------------------

    res.status(200).json({
      message: "Enrolled successfully",
      course: course.title,
      expiresAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};


// --- 2. ADMIN MANAGEMENT APIs ---

// @desc    Create a new course
// @route   POST /api/admin/courses/create
export const createCourse = async (req, res) => {
  try {
    const {
      title, description, category, price, createdBy, duration, isLiveCourse, durationInDays, paymentOptions
    } = req.body;

    if (!title || !description || !category || !price || !duration || !durationInDays) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Thumbnail image is required" });
    }

    // Cloudinary URL
    const thumbnail = req.file.path; 
    let parsedPaymentOptions = {};
    if (typeof paymentOptions === "string") {
    try { parsedPaymentOptions = JSON.parse(paymentOptions); } catch(e) {}
}

    const course = await Course.create({
      title,
      description,
      category,
      price: Number(price),
      createdBy,
      duration,
      thumbnail: thumbnail,
      isLiveCourse: isLiveCourse === "true",
      paymentOptions:parsedPaymentOptions,
      durationInDays: Number(durationInDays),
    });

    return res.status(201).json(course);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Update a course
// @route   PUT /api/admin/courses/:id/update
export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, category, price, createdBy, duration, isLiveCourse, durationInDays
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
      course.thumbnail = req.file.path;
    }

    const updatedCourse = await course.save();
    res.json(updatedCourse);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete a course
// @route   DELETE /api/admin/courses/:id/delete
export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Cleanup related data
    await Lesson.deleteMany({ course: course._id });
    await Module.deleteMany({ course: course._id });
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
// @route   GET /api/admin/courses
export const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({}).sort({ createdAt: -1 }).lean();

    const coursesWithContent = await Promise.all(
      courses.map(async (course) => {
        // 1. Get Modules
        const modules = await Module.find({ course: course._id })
          .sort("order")
          .lean();

        // 2. Get Lessons for each Module
        const modulesWithLessons = await Promise.all(
          modules.map(async (module) => {
            const lessons = await Lesson.find({ module: module._id })
              .sort("order")
              .lean();
            
            return {
              ...module,
              lessons: lessons, 
            };
          })
        );

        // 3. Get Live Meetings for this course
        const liveMeetings = await Meeting.find({ courseId: course._id })
          .sort({ date: 1, startTime: 1 })
          .lean();

        return {
          ...course,
          modules: modulesWithLessons,
          liveMeetings: liveMeetings, // Attached meetings to course response
        };
      })
    );

    res.json(coursesWithContent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// @desc    Get just the modules (for dropdowns/lists)
// @route   GET /api/courses/:id/modules
export const getCourseModules = async (req, res) => {
  try {
    const { id } = req.params;
    const modules = await Module.find({ course: id }).sort({ order: 1 }).lean();

    if (!modules || modules.length === 0) {
      return res.status(404).json({ message: "No modules found for this course" });
    }

    res.json(modules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get purchased students
// @route   GET /api/admin/courses/:courseId/students
export const getCoursePurchasedStudents = async (req, res) => {
    try {
      const { courseId } = req.params;
      if (!courseId) return res.status(400).json({ message: "courseId is required" });
  
      const students = await User.find({ "subscribedCourses.courseId": courseId })
        .select("FirstName LastName email subscribedCourses")
        .lean();
  
      const result = students.map((s) => {
        const sub = s.subscribedCourses.find((c) => String(c.courseId) === String(courseId));
        return {
          username: `${s.FirstName || ""} ${s.LastName || ""}`.trim(),
          email: s.email,
          subscribedAt: sub?.subscribedAt,
          expiresAt: sub?.expiresAt,
        };
      });
  
      return res.json({ courseId, totalStudents: result.length, students: result });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
};