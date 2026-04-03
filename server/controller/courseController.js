// import path from "path";
// import fs from "fs";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import { sendEnrollmentEmail } from "../utils/emailService.js";
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
    const { type } = req.query;
    let filter = {};

    const studentId = req.user?.id;
    const userRole = (req.user?.role || "").toLowerCase().trim();
    const isStaff = userRole === "admin" || userRole === "owner";

    if (type === "live") filter.isLiveCourse = true;

    // Cache static data for 60 seconds
    res.set("Cache-Control", "public, max-age=60");

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // 1. Parallelize initial queries (User, Courses, Total Count)
    const [student, courses, totalCourses] = await Promise.all([
      (studentId && !isStaff) ? User.findById(studentId).lean() : Promise.resolve(null),
      Course.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select("-description").lean(),
      Course.countDocuments(filter)
    ]);

    res.set("X-Total-Count", totalCourses);
    res.set("X-Total-Pages", Math.ceil(totalCourses / limit));

    // --- BULK LOADING: FETCH DATA AT ONCE (ABSOLUTE SPEED) ---
    const courseIds = courses.map(c => c._id);
    
    // Parallel fetch of all related data
    const [allModules, allMeetings, subscriptions] = await Promise.all([
      Module.find({ course: { $in: courseIds } }).select("-description").sort("order").lean(),
      Meeting.find({ courseId: { $in: courseIds } }).sort({ date: 1, startTime: 1 }).lean(),
      (studentId && !isStaff) ? Subscription.find({ student: studentId, course: { $in: courseIds } }).lean() : Promise.resolve([])
    ]);

    // Gather IDs for deeper fetching
    const allModuleIds = allModules.map(m => m._id);
    const [allSubModules] = await Promise.all([
        SubModule.find({ module: { $in: allModuleIds } }).select("-description").sort("order").lean(),
    ]);

    const allSubModIds = allSubModules.map(s => s._id);
    const [allLessons, allQuizzes] = await Promise.all([
        Lesson.find({ subModule: { $in: allSubModIds } }).select("-description").sort("order").lean(),
        Quiz.find({ subModule: { $in: allSubModIds } }).lean()
    ]);

    // Create fast lookup maps
    const subMapByCourse = (studentId && !isStaff) ? new Map(subscriptions.map(s => [s.course.toString(), s])) : new Map();
    const modulesByCourse = new Map(); allModules.forEach(m => {
        const cId = m.course.toString();
        if(!modulesByCourse.has(cId)) modulesByCourse.set(cId, []);
        modulesByCourse.get(cId).push(m);
    });
    const subModsByMod = new Map(); allSubModules.forEach(s => {
        const mId = s.module.toString();
        if(!subModsByMod.has(mId)) subModsByMod.set(mId, []);
        subModsByMod.get(mId).push(s);
    });
    const lessonsBySubMod = new Map(); allLessons.forEach(l => {
        const sId = l.subModule.toString();
        if(!lessonsBySubMod.has(sId)) lessonsBySubMod.set(sId, []);
        lessonsBySubMod.get(sId).push(l);
    });
    const quizzesBySubMod = new Map(allQuizzes.map(q => [q.subModule.toString(), q]));
    const meetingsByCourse = new Map(); allMeetings.forEach(m => {
        const cId = m.courseId.toString();
        if(!meetingsByCourse.has(cId)) meetingsByCourse.set(cId, []);
        meetingsByCourse.get(cId).push(m);
    });

    const now = new Date();
    const coursesWithContent = courses.map((course) => {
        const courseIdStr = course._id.toString();
        const sub = subMapByCourse.get(courseIdStr);
        const isSubscribed = sub && sub.expiresAt > now;

        // Populate Modules
        const courseModules = modulesByCourse.get(courseIdStr) || [];
        const modulesWithContent = courseModules.map(module => {
            const modSubMods = subModsByMod.get(module._id.toString()) || [];
            const subModulesWithLessons = modSubMods.map(subMod => {
                const subModIdStr = subMod._id.toString();
                const lessons = lessonsBySubMod.get(subModIdStr) || [];
                const securedLessons = lessons.map(lesson => {
                    if (isStaff || isSubscribed) return lesson;
                    const { contentUrl, ...lessonData } = lesson;
                    return { ...lessonData, contentUrl: null };
                });
                const quiz = quizzesBySubMod.get(subModIdStr);
                return { ...subMod, lessons: securedLessons, quiz: (isStaff || isSubscribed) ? quiz : null };
            });
            return { ...module, subModules: subModulesWithLessons };
        });

        // Populate Meetings
        const courseMeetings = meetingsByCourse.get(courseIdStr) || [];
        const securedMeetings = courseMeetings.map(m => {
            if (isStaff || isSubscribed) return m;
            return { ...m, meetingUrl: null };
        });

        // Calc Detailed Subscription Info
        let subscriptionDetails = null;
        if (sub && isSubscribed) {
            const totalAmount = sub.emi?.totalAmount || sub.amount || 0;
            const perInstallment = sub.emi?.perInstallmentAmount || 0;
            const paidAmount = (sub.paid_count || 0) * perInstallment;
            
            subscriptionDetails = {
              type: sub.type,
              status: sub.status,
              totalCount: sub.total_count,
              paidCount: sub.paid_count,
              remainingCount: Math.max(0, (sub.total_count || 0) - (sub.paid_count || 0)),
              totalAmount: totalAmount,
              paidAmount: paidAmount,
              balanceAmount: Math.max(0, totalAmount - paidAmount),
              nextPaymentAt: sub.next_payment_at,
              expiresAt: sub.expiresAt
            };
        }

        return {
          ...course,
          discountedPrice: getDiscountedPrice(course),
          isSubscribed,
          subscriptionDetails,
          modules: modulesWithContent,
          liveMeetings: securedMeetings
        };
    });

    res.json(coursesWithContent);
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
    const studentId = req.user?.id;
    // Normalize role to lowercase to prevent "Admin" vs "admin" mismatch
    const userRole = (req.user?.role || "").toLowerCase().trim();
    
    // Define who is staff
    const isStaff = userRole === "admin" || userRole === "owner";

    const course = await Course.findById(req.params.id).lean();
    if (!course) return res.status(404).json({ message: "Course not found" });

    // 1. Check Subscription only for Students
    let isSubscribed = false;
    if (studentId && !isStaff) {
      const student = await User.findById(studentId);
      const now = new Date();
      isSubscribed = student?.subscribedCourses?.some(
        (sub) => sub.courseId.toString() === req.params.id && sub.expiresAt > now
      );
    }

    // 2. Fetch Modules & Deep Hierarchy
    // Structure: Module -> SubModule -> Lessons(Categorized)
    const modules = await Module.find({ course: req.params.id }).sort("order").lean();

    const modulesWithContent = await Promise.all(
      modules.map(async (module) => {
        // A. Fetch SubModules for this Module
        const subModules = await SubModule.find({ module: module._id }).sort("order").lean();

        // B. For each SubModule, fetch Lessons
        const subModulesWithLessons = await Promise.all(
          subModules.map(async (subMod) => {
            const lessons = await Lesson.find({ subModule: subMod._id }).sort("order").lean();

            // Secure the lessons
            const securedLessons = lessons.map(lesson => {
              if (isStaff || isSubscribed) return lesson;
              
              // Hide access if not subscribed
              const { contentUrl, ...lessonData } = lesson;
              return { ...lessonData, contentUrl: null };
            });

            // Fetch Quiz for SubModule
            const quiz = await Quiz.findOne({ subModule: subMod._id }).lean();
            
            // Secure the Quiz
            // Hide the actual quiz document logic from unsubscribed users
            // You can also just delete the correctOption field instead if you want them to see title
            let securedQuiz = null; 
            if (quiz) {
                if (isStaff || isSubscribed) {
                    securedQuiz = quiz;
                }
            }

            return { ...subMod, lessons: securedLessons, quiz: securedQuiz };
          })
        );

        // C. (Legacy Support - removed for strict hierarchy)
        // No direct lessons under module

        return { 
          ...module, 
          subModules: subModulesWithLessons
        };
      })
    );

    // 3. Fetch & Secure Meetings
    const meetings = await Meeting.find({ courseId: req.params.id }).sort({ date: 1 }).lean();
    const securedMeetings = meetings.map(m => {
        // Staff and Subscribed students see the link
        if (isStaff || isSubscribed) return m;
        return { ...m, meetingUrl: null };
    });

    // 4. Detailed Subscription Info (EMI/Balance)
    let subscriptionDetails = null;
    if (studentId && !isStaff) {
      const sub = await Subscription.findOne({ 
        student: studentId, 
        course: req.params.id 
      }).lean();

      if (sub) {
        const totalAmount = sub.emi?.totalAmount || sub.amount || 0;
        const perInstallment = sub.emi?.perInstallmentAmount || 0;
        const paidAmount = (sub.paid_count || 0) * perInstallment;
        
        subscriptionDetails = {
          type: sub.type,
          status: sub.status,
          totalCount: sub.total_count,
          paidCount: sub.paid_count,
          remainingCount: Math.max(0, (sub.total_count || 0) - (sub.paid_count || 0)),
          totalAmount: totalAmount,
          paidAmount: paidAmount,
          balanceAmount: Math.max(0, totalAmount - paidAmount),
          nextPaymentAt: sub.next_payment_at,
          expiresAt: sub.expiresAt
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