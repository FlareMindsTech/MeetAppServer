// import path from "path";
// import fs from "fs";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import { sendEnrollmentEmail } from "../utils/emailService.js";
import { sendCourseOfferWhatsApp } from "../utils/whatsappService.js";
import Subscription from "../Model/subscription.js"; 
import Module from "../Model/module.js";  
import Lesson from "../Model/lesson.js"; 
import Meeting from "../Model/meet.js";
import SubModule from "../Model/subModule.js";
import Quiz from "../Model/quiz.js";

/* Helper: Calculate discounted price */
const getDiscountedPrice = (course) => {
  if (!course.discount || course.discount <= 0) return course.price;
  const discountAmount = (course.price * course.discount) / 100;
  return Math.round(course.price - discountAmount);
};

// --- 1. PUBLIC & STUDENT APIs ---

// @desc    List all courses with nested data (Public)
// @route   GET /api/courses
export const getPublicCourses = async (req, res) => {
  try {
    const { type, page, limit = 20, search, category } = req.query;
    let filter = {};

    const studentId = req.user?.id;

    if ((type === "my" || type === "purchased") && studentId) {
        const student = await User.findById(studentId).lean();
        const enrolledCourseIds = (student?.subscribedCourses || [])
            .map(s => s.courseId?.toString())
            .filter(Boolean);
        filter._id = { $in: enrolledCourseIds };
    } else {
        if (type === "recorded") filter.isLiveCourse = false;
        if (type === "live") filter.isLiveCourse = true;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
      ];
    }

    if (category && category.trim()) {
      filter.category = category.trim();
    }

    let student = null;
    if (studentId) {
      student = await User.findById(studentId).lean();
    }

    const attachStatus = (coursesList) => coursesList.map(course => {
      let isSubscribed = false;
      if (student && student.subscribedCourses) {
        const now = new Date();
        isSubscribed = student.subscribedCourses.some(
          (sub) => sub.courseId.toString() === course._id.toString() && new Date(sub.expiresAt) > now
        );
      }
      return {
        ...course,
        discountedPrice: getDiscountedPrice(course),
        isSubscribed: isSubscribed
      };
    });

    if (!page) {
      const courses = await Course.find(filter).sort({ createdAt: -1 }).lean();
      return res.json(attachStatus(courses));
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [courses, totalCount] = await Promise.all([
      Course.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Course.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.set("X-Total-Count", String(totalCount));
    res.set("X-Total-Pages", String(totalPages));
    res.json(attachStatus(courses));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get Single Course Details with Modules (Public/Student)
// @route   GET /api/courses/:id
// export const getCourseDetails = async (req, res) => {
//   try {
//     const studentId = req.user?.id;
//     const course = await Course.findById(req.params.id).lean();
//     if (!course) {
//       return res.status(404).json({ message: "Course not found" });
//     }

//     // 1. Fetch Modules for this course
//     const modules = await Module.find({ course: req.params.id })
//       .sort("order")
//       .lean();

//     // Fetch Lessons for each Module
//     const modulesWithLessons = await Promise.all(
//       modules.map(async (module) => {
//         const lessons = await Lesson.find({ module: module._id })
//           .sort("order")
//           .lean();
//         return { ...module, lessons };
//       })
//     );

//     // 2. Fetch Live Meetings for this course
//     const meetings = await Meeting.find({ courseId: req.params.id })
//       .sort({ date: 1, startTime: 1 })
//       .lean();

//     // 3. Security Check: Is the user authorized to see the URL?
//     let isSubscribed = false;
//     if (studentId) {
//         const student = await User.findById(studentId);
//         const now = new Date();
//         isSubscribed = student?.subscribedCourses?.some(
//             (sub) => sub.courseId.toString() === req.params.id && sub.expiresAt > now
//         );
//     }

//     const isAdmin = ["admin", "owner"].includes(req.user?.role?.toLowerCase());

//     const securedMeetings = meetings.map(m => {
//         // Only return meetingUrl if subscribed or admin
//         if (!isSubscribed && !isAdmin) {
//             const { meetingUrl, ...rest } = m; 
//             return { ...rest, meetingUrl: null }; 
//         }
//         return m;
//     });

//     res.json({ 
//       ...course, 
//       modules: modulesWithLessons, 
//       liveMeetings: securedMeetings || [] 
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };



export const getCourseDetails = async (req, res) => {
  try {
    const { id: courseId } = req.params;
    const studentId = req.user?.id;
    const userRole = (req.user?.role || "").toLowerCase().trim();
    const isStaff = userRole === "admin" || userRole === "owner";

    // 1. Fetch Core Course & Student Data
    const [course, student] = await Promise.all([
      Course.findById(courseId).lean(),
      studentId ? User.findById(studentId).lean() : null
    ]);

    if (!course) return res.status(404).json({ message: "Course not found" });

    // 2. Check Subscription
    let isSubscribed = false;
    let subscription = null;
    
    if (studentId) {
      // 2. Check Subscription & Role
      const now = new Date();
      // Add a 24-hour grace period to prevent clock-sync/timezone issues
      const gracePeriodNow = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      const hasEnrollment = student && student.subscribedCourses?.some(
        (sub) => (String(sub.courseId).trim() === String(courseId).trim()) && 
                 (new Date(sub.expiresAt) > gracePeriodNow)
      );

      // Staff (Owner/Admin) always have access
      if (isStaff) {
        isSubscribed = true;
      } else {
        // For students, check active enrollment
        isSubscribed = !!hasEnrollment;
        
        // REDUNDANT CHECK: If profile check fails, check Subscription collection directly
        if (!isSubscribed) {
          const directSub = await Subscription.findOne({ 
            student: studentId, 
            course: courseId,
            status: { $in: ['active', 'success', 'completed'] }
          }).lean();
          
          if (directSub) {
            // Check if direct subscription is still valid
            if (!directSub.expiresAt || new Date(directSub.expiresAt) > gracePeriodNow) {
              isSubscribed = true;
            }
          }
        }

        // Final Override: Check for explicit cancellation
        subscription = await Subscription.findOne({ 
          student: studentId, 
          course: courseId 
        }).sort({ createdAt: -1 }).lean();

        if (subscription && subscription.status === 'cancelled') {
          isSubscribed = false; 
        }
      }
    }

    // 3. Fetch All Hierarchy Data in Bulk
    const modules = await Module.find({ course: courseId }).sort("order").lean();
    const moduleIds = modules.map(m => m._id);

    const subModules = await SubModule.find({ module: { $in: moduleIds } }).sort("order").lean();
    const subModuleIds = subModules.map(sm => sm._id);

    const [lessons, quizzes, meetings] = await Promise.all([
      Lesson.find({ subModule: { $in: subModuleIds } }).sort("order").lean(),
      Quiz.find({ subModule: { $in: subModuleIds } }).lean(),
      Meeting.find({ courseId }).sort({ date: 1 }).lean()
    ]);

    // 4. Organize Data in Memory
    const lessonsBySubModule = lessons.reduce((acc, lesson) => {
      const subId = lesson.subModule.toString();
      if (!acc[subId]) acc[subId] = [];
      
      // Access Logic: Staff, Subscribed Users, or Free Lessons get full content
      if (isStaff || isSubscribed || lesson.isFree) {
        acc[subId].push(lesson);
      } else {
        // Locked Content: Remove the contentUrl
        const { contentUrl, ...lessonData } = lesson;
        acc[subId].push({ ...lessonData, contentUrl: null });
      }
      return acc;
    }, {});

    const quizzesBySubModule = quizzes.reduce((acc, quiz) => {
      if (isStaff || isSubscribed) acc[quiz.subModule.toString()] = quiz;
      return acc;
    }, {});

    const subModulesByModule = subModules.reduce((acc, subMod) => {
      const modId = subMod.module.toString();
      if (!acc[modId]) acc[modId] = [];
      const subId = subMod._id.toString();
      acc[modId].push({
        ...subMod,
        lessons: lessonsBySubModule[subId] || [],
        quiz: quizzesBySubModule[subId] || null
      });
      return acc;
    }, {});

    const modulesWithContent = modules.map(mod => ({
      ...mod,
      subModules: subModulesByModule[mod._id.toString()] || []
    }));

    const securedMeetings = meetings.map(m => {
      if (isStaff || isSubscribed) return m;
      return { ...m, meetingUrl: null };
    });

    // 5. Build Subscription Details
    let subscriptionDetails = null;
    if (subscription && subscription.type !== "free") {
      const isEMI = subscription.total_count > 1 && subscription.amount > 0 && subscription.type !== 'renewal';
      
      if (isEMI) {
        const totalAmount = subscription.amount || 0;
        const paidCount = subscription.paid_count || 0;
        const totalCount = subscription.total_count || 1;
        const installmentAmount = totalAmount / totalCount;
        const paidAmount = paidCount * installmentAmount;
        const remainingAmount = Math.max(0, totalAmount - paidAmount);

        subscriptionDetails = {
          type: "emi",
          status: subscription.status,
          paidAmount: Math.round(paidAmount),
          balanceAmount: Math.round(remainingAmount),
          totalAmount: Math.round(totalAmount),
          paidCount: paidCount,
          totalCount: totalCount,
          nextPaymentAt: subscription.next_payment_at,
          expiresAt: subscription.expiresAt || student?.subscribedCourses?.find(s => s.courseId.toString() === courseId)?.expiresAt
        };
      } else {
        // Renewal or Standard
        subscriptionDetails = {
          type: "renewal",
          status: subscription.status,
          expiresAt: subscription.expiresAt || student?.subscribedCourses?.find(s => s.courseId.toString() === courseId)?.expiresAt,
          paidCount: subscription.paid_count || 0,
          totalCount: subscription.total_count || 0,
        };
      }
    }

    res.json({ 
      ...course, 
      discountedPrice: getDiscountedPrice(course),
      isSubscribed,
      subscriptionDetails,
      modules: modulesWithContent, 
      liveMeetings: securedMeetings 
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
    // Determine duration and expiry
    let durationInDays = parseInt(course.durationInDays, 10) || 365;
    let expiresAt;

    // Fix for the "2300" year issue: If duration is huge (e.g. 100,000 or >= 5000 days), treat as Lifetime
    if (durationInDays >= 5000) {
      expiresAt = new Date("9999-12-31T23:59:59.000Z");
    } else {
      expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + durationInDays);
    }

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
      await sendEnrollmentEmail({
        student,
        course,
        expiresAt,
        isOneTime: false
      });
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
      title, description, category, price, createdBy, duration, isLiveCourse, durationInDays, paymentOptions, liveMeetings
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
    if (paymentOptions) {
        if (typeof paymentOptions === "string") {
            try { parsedPaymentOptions = JSON.parse(paymentOptions); } catch(e) { console.error("Failed to parse payment options", e); }
        } else {
            parsedPaymentOptions = paymentOptions;
        }
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
      isRecurring: req.body.isRecurring === "true",
      paymentOptions:parsedPaymentOptions,
      durationInDays: Number(durationInDays),
      discount: Number(req.body.discount || 0),
    });

    let parsedLiveMeetings = [];
    if (liveMeetings) {
        if (typeof liveMeetings === "string") {
            try { parsedLiveMeetings = JSON.parse(liveMeetings); } catch(e) { console.error("Failed to parse live meetings", e); }
        } else {
            parsedLiveMeetings = liveMeetings;
        }
    }

    if (parsedLiveMeetings && parsedLiveMeetings.length > 0) {
      const meetingDocs = parsedLiveMeetings.map(m => {
        let mDate = new Date();
        if (m.date) mDate = new Date(m.date);
        
        return {
           className: m.className || `${title} Live Class`,
           date: mDate,
           startTime: m.startTime || "10:00 AM",
           endTime: m.endTime || "11:00 AM",
           meetingUrl: m.meetingUrl || null,
           courseId: course._id,
           status: m.status || "Upcoming",
        };
      });
      await Meeting.insertMany(meetingDocs);
    }

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
      title, description, category, price, createdBy, duration, isLiveCourse, durationInDays, paymentOptions, liveMeetings
    } = req.body;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    if (title) course.title = title;
    if (description) course.description = description;
    if (category) course.category = category;
    if (price !== undefined) course.price = Number(price);
    if (createdBy) course.createdBy = createdBy;
    if (duration) course.duration = duration;

    if (isLiveCourse !== undefined) {
        course.isLiveCourse = isLiveCourse === "true";
    }
    if (req.body.isRecurring !== undefined) {
        course.isRecurring = req.body.isRecurring === "true";
    }

    if (durationInDays !== undefined) {
        course.durationInDays = Number(durationInDays);
    }
    if (req.body.discount !== undefined) {
      course.discount = Number(req.body.discount);
    }

    if (paymentOptions) {
        let parsedOptions = {};
        if (typeof paymentOptions === 'string') {
            try { parsedOptions = JSON.parse(paymentOptions); } catch (e) { console.error("Failed to parse payment options in update", e); }
        } else {
            parsedOptions = paymentOptions;
        }
        if (Object.keys(parsedOptions).length > 0) {
            course.paymentOptions = course.paymentOptions || {};
            if (parsedOptions.allowFullPayment !== undefined) course.paymentOptions.allowFullPayment = parsedOptions.allowFullPayment;
            if (parsedOptions.allowEMI !== undefined) course.paymentOptions.allowEMI = parsedOptions.allowEMI;
            if (parsedOptions.emiPlans !== undefined) course.paymentOptions.emiPlans = parsedOptions.emiPlans;
            if (parsedOptions.allowRenewal !== undefined) course.paymentOptions.allowRenewal = parsedOptions.allowRenewal;
            if (parsedOptions.renewalPlans !== undefined) course.paymentOptions.renewalPlans = parsedOptions.renewalPlans;
            course.markModified('paymentOptions');
        }
    }

    if (req.file) {
      course.thumbnail = req.file.path;
    }

    const updatedCourse = await course.save();

    let parsedLiveMeetings = null;
    if (liveMeetings) {
        if (typeof liveMeetings === "string") {
            try { parsedLiveMeetings = JSON.parse(liveMeetings); } catch(e) { console.error("Failed to parse live meetings", e); }
        } else {
            parsedLiveMeetings = liveMeetings;
        }
    }

    if (parsedLiveMeetings) {
      const existingIds = [];
      for (const m of parsedLiveMeetings) {
         let mDate = new Date();
         if (m.date) mDate = new Date(m.date);
         
         if (m._id) {
            existingIds.push(m._id);
            await Meeting.findByIdAndUpdate(m._id, {
               className: m.className || `${course.title} Live Class`,
               date: mDate,
               startTime: m.startTime || "10:00 AM",
               endTime: m.endTime || "11:00 AM",
               meetingUrl: m.meetingUrl || null,
               status: m.status || "Upcoming"
            });
         } else {
            const newM = await Meeting.create({
               className: m.className || `${course.title} Live Class`,
               date: mDate,
               startTime: m.startTime || "10:00 AM",
               endTime: m.endTime || "11:00 AM",
               meetingUrl: m.meetingUrl || null,
               courseId: course._id,
               status: m.status || "Upcoming"
            });
            existingIds.push(newM._id);
         }
      }

      await Meeting.deleteMany({
         courseId: course._id,
         _id: { $nin: existingIds }
      });
    }

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

        // 2. Get SubModules and Lessons
        const modulesWithContent = await Promise.all(
          modules.map(async (module) => {
            // SubModules
            const subModules = await SubModule.find({ module: module._id }).sort("order").lean();
            
            const subModulesWithLessons = await Promise.all(
              subModules.map(async (subMod) => {
                const lessons = await Lesson.find({ subModule: subMod._id }).sort("order").lean();
                const quiz = await Quiz.findOne({ subModule: subMod._id }).lean();

                return { ...subMod, lessons, quiz };
              })
            );

            // Direct Lessons (Legacy/Root) - Strict Hierarchy Enforced
            
            return {
              ...module,
              subModules: subModulesWithLessons
            };
          })
        );

        // 3. Get Live Meetings for this course
        const liveMeetings = await Meeting.find({ courseId: course._id })
          .sort({ date: 1, startTime: 1 })
          .lean();

        return {
          ...course,
          discountedPrice: getDiscountedPrice(course),
          modules: modulesWithContent,
          liveMeetings: liveMeetings,
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

    const modulesWithSubModules = await Promise.all(
      modules.map(async (module) => {
        const subModules = await SubModule.find({ module: module._id }).sort("order").lean();
        return { ...module, subModules };
      })
    );

    res.json(modulesWithSubModules);
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

// @desc    Manually enroll a student (Admin only - for offline payments)
// @route   POST /api/admin/manual-enroll
export const manualEnrollStudent = async (req, res) => {
  try {
    const { student_id, course_id } = req.body;

    if (!student_id || !course_id) {
      return res.status(400).json({ message: "Student ID and Course ID are required" });
    }

    // 1. Check if Course Exists
    const course = await Course.findById(course_id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 2. Find Student
    const student = await User.findById(student_id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    // 3. Check if already enrolled in active course
    const existingSub = student.subscribedCourses.find(
      (sub) => sub.courseId.toString() === course_id
    );

    const now = new Date();

    // 4. Calculate Expiry
    let durationInDays = parseInt(course.durationInDays, 10) || 365;
    let expiresAt;

    if (durationInDays >= 5000) {
      expiresAt = new Date("9999-12-31T23:59:59.000Z");
    } else {
      expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + durationInDays);
    }

    // 5. Update user document
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

    // 6. Create Subscription record for audit
    await Subscription.create({
      student: student_id,
      course: course_id,
      type: "offline_payment",
      amount: course.price, // Record the actual price for accounting
      currency: "INR",
      status: "active",
      expiresAt,
      metadata: { 
        source: "admin-manual-allocation", 
        adminId: req.user.id,
        note: "Manual payment at office"
      },
    });

    // 7. Send notification emails
    try {
      await sendEnrollmentEmail({
        student,
        course,
        expiresAt,
        isOneTime: true
      });
    } catch (emailErr) {
      console.error("Email sending failed:", emailErr);
    }

    res.status(200).json({
      success: true,
      message: `Successfully enrolled ${student.FirstName || 'Student'} in ${course.title}`,
      expiresAt,
    });
  } catch (err) {
    console.error("Manual enrollment error:", err);
    res.status(500).json({ message: err.message });
  }
};