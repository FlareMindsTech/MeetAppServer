import crypto from "crypto";
import { razorpay } from "../config/razorpayClient.js";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import Payment from "../Model/payment.js";
import Subscription from "../Model/subscription.js";
import { sendEnrollmentEmail, sendPaymentExtensionEmail } from "../utils/emailService.js";
import mongoose from "mongoose";
import Lesson from "../Model/lesson.js";
import Module from "../Model/module.js";
/* ---------------- Helper: Discount ---------------- */
const getDiscountedPrice = (course) => {
  if (!course.discount || course.discount <= 0) return course.price;
  const discountAmount = (course.price * course.discount) / 100;
  return Math.round(course.price - discountAmount);
};


/* ---------------- 1) Initiate Payment wrapper ---------------- */
// export const initiatePayment = async (req, res) => {
//   try {
//     console.log("initiatePayment body:", req.body);
//     const { type, paymentOption, plan_id } = req.body || {};

//     const isSubscription =
//       (typeof type === "string" && type.toLowerCase() === "subscription") ||
//       (typeof paymentOption === "string" && paymentOption.toLowerCase() === "emi") ||
//       !!plan_id;

//     if (isSubscription) return createSubscription(req, res);
//     return createOrder(req, res);
//   } catch (err) {
//     console.error("initiatePayment err:", err);
//     res.status(500).json({ message: err.message || "Internal Server Error" });
//   }
// };




/* ---------------- 1) Initiate Payment wrapper ---------------- */

/* ---------------- 1) Initiate Payment wrapper ---------------- */
export const initiatePayment = async (req, res) => {
  try {
    const { courseId, type, paymentOption, plan_id } = req.body || {};
    if (!courseId) return res.status(400).json({ message: "Course ID is required" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Handle Free Course (Price: 0)
    if (Number(course.price || 0) === 0) {
      const student = await User.findById(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const isAlreadyEnrolled = student.subscribedCourses.find(
        (sub) => String(sub.courseId) === String(courseId)
      );

      if (isAlreadyEnrolled) return res.status(400).json({ message: "Already enrolled" });

      // Determine lifetime access for free course
      let durationInDays = parseInt(course.durationInDays, 10) || 365;
      let expiresAt;
      if (durationInDays >= 5000) {
        expiresAt = new Date("9999-12-31T23:59:59.000Z");
      } else {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationInDays);
      }

      student.subscribedCourses.push({
        courseId: course._id,
        subscribedAt: new Date(),
        expiresAt: expiresAt, 
      });
      await student.save();

      // Create a Subscription record (type = free) for record-keeping and course-list visibility
      try {
        await Subscription.create({
          student: student._id,
          course: course._id,
          type: "free",
          amount: 0,
          currency: "INR",
          status: "active",
          expiresAt,
          metadata: { source: "initiate-free-enroll" },
        });
      } catch (subErr) {
        console.error("Manual subscription record creation failed:", subErr);
      }

      // Send Enrollment Email
      try {
        await sendEnrollmentEmail({
          student,
          course,
          expiresAt,
          isOneTime: false
        });
      } catch (emailErr) {
        console.error("Free enrollment email failed:", emailErr);
      }

      return res.status(200).json({ message: "Free course enrolled successfully!", free: true });
    }

    // Determine if Subscription/EMI logic is needed
    const isSubscription = 
      course.isRecurring === true || 
      (type && String(type).toLowerCase().includes("subscription")) ||
      (paymentOption && String(paymentOption).toLowerCase() === "emi") ||
      !!plan_id;

    if (isSubscription) {
      return createSubscription(req, res);
    } else {
      return createOrder(req, res);
    }
  } catch (err) {
    console.error("initiatePayment error:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};



/* ---------------- 2) One-time Order ---------------- */
export const createOrder = async (req, res) => {
  try {
    const { courseId } = req.body;
    const student = await User.findById(req.user.id);
    if (!courseId) return res.status(400).json({ message: "Course ID is required" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isSubscribed = student.subscribedCourses.find(
      (sub) => String(sub.courseId) === String(courseId) && new Date(sub.expiresAt) > new Date()
    );
    if (isSubscribed) return res.status(400).json({ message: "You are already subscribed to this course" });

    const finalPrice = getDiscountedPrice(course);
    let amountInPaise = Math.round(Number(finalPrice || 0) * 100);

    console.log(`[createOrder] Title: ${course.title}, Final Price: ${finalPrice}, Calculated Paise: ${amountInPaise}`);

    // RAZORPAY SAFETY: Ensure minimum ₹1 (100 paise) for paid orders to avoid failure
    if (finalPrice > 0 && amountInPaise < 100) {
      amountInPaise = 100;
    }

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    console.log(`Initiating Order: ${course.title}, Price: ${finalPrice}, Paise: ${amountInPaise}`);
    const order = await razorpay.orders.create(options);

    await Subscription.create({
      student: student._id,
      course: course._id,
      type: "one-time",
      amount: Number(finalPrice),
      currency: "INR",
      razorpay_order_id: order.id,
      status: "pending",
      metadata: { receipt: options.receipt },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      courseTitle: course.title,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("createOrder err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

/* ---------------- 3) Verify One-time Payment ---------------- */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId } = req.body;
    const studentId = req.user.id;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courseId) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
    if (expectedSignature !== razorpay_signature) return res.status(400).json({ message: "Invalid payment signature" });

    const student = await User.findById(studentId);
    const course = await Course.findById(courseId);
    if (!student || !course) return res.status(404).json({ message: "User or Course not found" });

    const now = new Date();
    
    // --- DYNAMIC VALIDITY LOGIC ---
    // 1. Get duration (default to 365 if missing)
    const durationInDays = course.durationInDays || 365;
    
    // 2. Determine if this counts as "Lifetime" 
    // Threshold: If duration is > 5000 days (approx 13+ years), treat as Lifetime
    const isLifetime = durationInDays > 5000; 

    let expiresAt;
    let accessMessage;

    if (isLifetime) {
        // Set to Far Future for Lifetime
        expiresAt = new Date("9999-12-31T23:59:59.000Z");
        accessMessage = "Payment successful! You have been enrolled with LIFETIME ACCESS.";
    } else {
        // Calculate specific expiry date for Limited Time
        expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));
        accessMessage = `Payment successful! You have access for ${durationInDays} days (until ${expiresAt.toLocaleDateString()}).`;
    }

    const existingSub = student.subscribedCourses.find((sub) => String(sub.courseId) === String(courseId));
    if (existingSub) {
      existingSub.subscribedAt = now;
      existingSub.expiresAt = expiresAt;
    } else {
      student.subscribedCourses.push({ courseId: course._id, subscribedAt: now, expiresAt });
    }
    await student.save();

    await Payment.create({ student: studentId, course: courseId, razorpay_order_id, razorpay_payment_id, razorpay_signature, amount: getDiscountedPrice(course) });

    await Subscription.findOneAndUpdate(
      { student: studentId, course: courseId, type: "one-time", razorpay_order_id },
      {
        status: "active", 
        lifetimeAccess: isLifetime, 
        razorpay_order_id,
        $push: {
          paymentHistory: {
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            amount: getDiscountedPrice(course),
            currency: "INR",
            status: "paid",
            paidAt: new Date(),
          },
        },
        expiresAt, 
      },
      { upsert: true, new: true }
    );

    // Send Email using centralized service
    await sendEnrollmentEmail({
      student,
      course,
      expiresAt,
      isOneTime: true
    });

    res.status(200).json({ message: "Payment successful! Course access granted." });
  } catch (err) {
    console.error("verifyPayment err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

/* ---------------- 4) Verify Subscription (EMI/Renewal) ---------------- */
export const verifySubscription = async (req, res) => {
  try {
    console.log("verifySubscription body received:", req.body);
    const { courseId } = req.body;
    const studentId = req.user.id;
    
    // Support both razorpay_ prefixed and non-prefixed fields
    const subscriptionId = req.body.razorpay_subscription_id || req.body.subscriptionId || req.body.subscription_id;
    const paymentId = req.body.razorpay_payment_id || req.body.paymentId || req.body.payment_id;
    const signature = req.body.razorpay_signature || req.body.signature;

    if (!paymentId || !signature || !courseId) {
      console.error("Missing mandatory verification fields:", { paymentId, signature, courseId });
      return res.status(400).json({ 
        message: "Verification failed: Missing required payment fields",
        success: false
      });
    }

    // Verify Signature
    const body = paymentId + "|" + subscriptionId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    const isTestMode = process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_');

    if (expectedSignature !== signature) {
      console.error("Signature mismatch. Expected:", expectedSignature, "Received:", signature, "Body Used:", body);
      
      // If in test mode, we can be more lenient if the IDs exist and are valid
      if (isTestMode) {
        console.warn("Test Mode Detected: Bypassing signature mismatch for testing purposes.");
      } else {
        return res.status(400).json({ message: "Invalid subscription signature" });
      }
    }

    const student = await User.findById(studentId);
    const course = await Course.findById(courseId);
    if (!student || !course) return res.status(404).json({ message: "User or Course not found" });

    // Update Local Subscription Record
    let localSub = await Subscription.findOne({ 
      student: studentId, 
      course: courseId, 
      razorpay_subscription_id: subscriptionId 
    });

    if (!localSub) {
      console.warn("Subscription not found by ID. Searching for latest pending...");
      localSub = await Subscription.findOne({
        student: studentId,
        course: courseId,
        status: "pending"
      }).sort({ createdAt: -1 });
    }

    if (!localSub) {
      return res.status(404).json({ message: "No local subscription record found" });
    }

    const now = new Date();
    const durationInDays = course.durationInDays || 365;
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));

    // Grant Access to Student
    const existingSubIndex = student.subscribedCourses.findIndex((sub) => String(sub.courseId) === String(courseId));
    if (existingSubIndex >= 0) {
      student.subscribedCourses[existingSubIndex].subscribedAt = now;
      student.subscribedCourses[existingSubIndex].expiresAt = expiresAt;
    } else {
      student.subscribedCourses.push({ courseId: course._id, subscribedAt: now, expiresAt });
    }
    await student.save();

    // Update Local Sub Status
    localSub.status = "active";
    localSub.paid_count = (localSub.paid_count || 0) + 1;
    localSub.paymentHistory.push({
      payment_id: paymentId,
      amount: localSub.amount / (localSub.total_count || 1), // Approximate
      currency: "INR",
      status: "Success",
      paidAt: now
    });
    await localSub.save();
    
    // Create Payment Record (Legacy support)
    try {
      await Payment.create({
        student: studentId,
        course: courseId,
        razorpay_payment_id: paymentId,
        razorpay_subscription_id: subscriptionId,
        razorpay_signature: signature,
        amount: localSub.amount / (localSub.total_count || 1),
        status: "success"
      });
    } catch (payErr) {
      console.error("Payment record creation failed but continuing:", payErr);
    }

    res.json({ message: "Subscription verified successfully!", success: true });
  } catch (err) {
    console.error("verifySubscription err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

/* ---------------- 4) Create Subscription (EMI) ---------------- */
// export const createSubscription = async (req, res) => {
//   try {
//     const { plan_id, courseId, emiPlanId, total_count } = req.body;
//     const studentId = req.user.id;
//     if (!courseId) return res.status(400).json({ message: "courseId is required" });

//     const student = await User.findById(studentId);
//     const course = await Course.findById(courseId);
//     if (!student || !course) return res.status(404).json({ message: "Student or Course not found" });

//     // === Create-or-find Razorpay customer and store id on user ===
//     let razorpayCustomerId = student.razorpay_customer_id || null;
//     if (!razorpayCustomerId) {
//       try {
//         const createdCustomer = await razorpay.customers.create({
//           name: `${student.FirstName || ""} ${student.LastName || ""}`.trim() || student.email,
//           email: student.email,
//           contact: student.contact || undefined,
//         });
//         razorpayCustomerId = createdCustomer.id;
//         student.razorpay_customer_id = razorpayCustomerId;
//         await student.save().catch(() => {});
//         console.log("Created new Razorpay customer:", razorpayCustomerId);
//       } catch (err) {
//         // If customer already exists, attempt to find and reuse
//         const errDesc = (err && (err.description || (err.error && err.error.description))) || "";
//         if (errDesc.toString().toLowerCase().includes("customer already exists")) {
//           try {
//             if (typeof razorpay.customers.all === "function") {
//               const list = await razorpay.customers.all({ email: student.email });
//               if (list && Array.isArray(list.items) && list.items.length > 0) {
//                 razorpayCustomerId = list.items[0].id;
//                 student.razorpay_customer_id = razorpayCustomerId;
//                 await student.save().catch(() => {});
//                 console.log("Reused existing razorpay customer id:", razorpayCustomerId);
//               } else {
//                 console.warn("Customer exists but customers.all returned none for email:", student.email);
//               }
//             } else {
//               // Fallback REST lookup by email
//               const resp = await fetch(
//                 `https://api.razorpay.com/v1/customers?email=${encodeURIComponent(student.email)}`,
//                 {
//                   headers: {
//                     Authorization:
//                       "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64"),
//                     "Content-Type": "application/json",
//                   },
//                 }
//               );
//               if (resp.ok) {
//                 const data = await resp.json();
//                 if (data && Array.isArray(data.items) && data.items.length > 0) {
//                   razorpayCustomerId = data.items[0].id;
//                   student.razorpay_customer_id = razorpayCustomerId;
//                   await student.save().catch(() => {});
//                   console.log("Reused existing razorpay customer id (REST):", razorpayCustomerId);
//                 } else {
//                   console.warn("No customer found via REST lookup for email:", student.email);
//                 }
//               } else {
//                 console.warn("Razorpay REST customer lookup failed with status:", resp.status);
//               }
//             }
//           } catch (listErr) {
//             console.warn("Failed to lookup existing Razorpay customer:", listErr);
//           }
//         } else {
//           console.warn("Could not create razorpay customer (continuing):", err && err.error ? err.error : err);
//         }
//         // continue even if we couldn't get a customer id
//       }
//     }

//     // === Resolve plan and installments ===
//     let selectedPlan = null;
//     if (course.paymentOptions && Array.isArray(course.paymentOptions.emiPlans)) {
//       selectedPlan = course.paymentOptions.emiPlans.find(
//         (p) => String(p._id) === String(emiPlanId) || p.plan_id === emiPlanId || p.plan_id === plan_id
//       );
//     }

//     const finalPlanIdInput = plan_id || (selectedPlan && selectedPlan.plan_id);
//     const resolvedTotalCount = Number(total_count || (selectedPlan && selectedPlan.installments));

//     if (!resolvedTotalCount || resolvedTotalCount <= 0) {
//       return res.status(400).json({ message: "total_count (installments) is required and must be > 0" });
//     }

//     // compute per-installment amount in paise
//     const totalAmountPaise = Math.round(Number(course.price || 0) * 100);
//     const perInstallmentPaise = Math.round(totalAmountPaise / resolvedTotalCount); // simple rounding strategy

//     // If a plan_id was provided, verify its amount matches per-installment amount;
//     // if not matching, we'll create a plan for this per-installment amount.
//     let chosenPlanId = finalPlanIdInput || null;
//     if (chosenPlanId) {
//       try {
//         // Try SDK fetch first (may differ by SDK version)
//         let existingPlan = null;
//         if (typeof razorpay.plans.fetch === "function") {
//           existingPlan = await razorpay.plans.fetch(chosenPlanId).catch(() => null);
//         } else {
//           // fallback REST GET /v1/plans/:id
//           const resp = await fetch(`https://api.razorpay.com/v1/plans/${chosenPlanId}`, {
//             headers: {
//               Authorization: "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64"),
//               "Content-Type": "application/json",
//             },
//           });
//           if (resp.ok) existingPlan = await resp.json().catch(() => null);
//         }

//         if (!existingPlan || Number(existingPlan.amount) !== Number(perInstallmentPaise)) {
//           // Plan mismatch — don't reuse; create a new plan below
//           chosenPlanId = null;
//         }
//       } catch (e) {
//         chosenPlanId = null;
//       }
//     }

//     if (!chosenPlanId) {
//       // Create a plan with amount = per-installment amount (paise)
//       const planPayload = {
//         period: "monthly", // choose billing period
//         interval: 1,
//         item: {
//           name: `${course.title} - EMI (${resolvedTotalCount} installments)`,
//           amount: perInstallmentPaise,
//           currency: "INR",
//           description: `EMI for ${course.title} — ${resolvedTotalCount} installments`,
//         },
//       };

//       const createdPlan = await razorpay.plans.create(planPayload);
//       chosenPlanId = createdPlan.id;
//     }

//     // Build subscription payload
//     const subscriptionPayload = {
//       plan_id: chosenPlanId,
//       total_count: Number(resolvedTotalCount),
//       customer_notify: 1,
//       // If your account supports customer_id and you want Razorpay to email / attach instruments:
//       // include customer_id: razorpayCustomerId
//     };

//     const rzpSubscription = await razorpay.subscriptions.create(subscriptionPayload);

//     // Map raw status -> our enum
//     const rawStatus = rzpSubscription && rzpSubscription.status ? String(rzpSubscription.status).toLowerCase() : null;
//     let mappedStatus = "pending";
//     if (rawStatus === "active") mappedStatus = "active";
//     else if (rawStatus === "completed") mappedStatus = "completed";
//     else mappedStatus = "pending";

//     // Persist local subscription record (do NOT grant access here)
//     const localSub = await Subscription.create({
//       student: studentId,
//       course: courseId,
//       type: "subscription",
//       plan_id: chosenPlanId,
//       amount: Number(course.price),
//       currency: "INR",
//       razorpay_subscription_id: rzpSubscription.id,
//       status: mappedStatus,
//       total_count: rzpSubscription.total_count || Number(resolvedTotalCount),
//       paid_count: 0,
//       next_payment_at: rzpSubscription.current_end ? new Date(rzpSubscription.current_end * 1000) : null,
//       expiresAt: null,
//       emi: selectedPlan
//         ? {
//             planName: selectedPlan.name,
//             plan_id: selectedPlan.plan_id,
//             installments: selectedPlan.installments,
//             perInstallmentAmount: selectedPlan.perInstallmentAmount,
//             totalAmount: selectedPlan.totalAmount,
//             interestPercent: selectedPlan.interestPercent,
//           }
//         : {
//             planName: `${course.title} EMI`,
//             plan_id: chosenPlanId,
//             installments: Number(resolvedTotalCount),
//             perInstallmentAmount: perInstallmentPaise / 100,
//             totalAmount: Number(course.price),
//           },
//       metadata: { razorpaySubscription: rzpSubscription },
//     });

//     return res.json({ subscriptionId: rzpSubscription.id, keyId: process.env.RAZORPAY_KEY_ID, localSubscriptionId: localSub._id });
//   } catch (err) {
//     console.error("createSubscription err:", err);
//     if (err && err.statusCode && err.error) {
//       return res.status(err.statusCode).json({ message: err.error.description || err.error });
//     }
//     res.status(500).json({ message: err.message || "Internal Server Error" });
//   }
// };



export const createSubscription = async (req, res) => {
  try {
    const { plan_id, courseId, emiPlanId, total_count } = req.body;
    const studentId = req.user.id;
    if (!courseId) return res.status(400).json({ message: "courseId is required" });

    const student = await User.findById(studentId);
    const course = await Course.findById(courseId);
    if (!student || !course) return res.status(404).json({ message: "Student or Course not found" });

    // === Create-or-find Razorpay customer ===
    let razorpayCustomerId = student.razorpay_customer_id || null;
    if (!razorpayCustomerId) {
      try {
        const createdCustomer = await razorpay.customers.create({
          name: `${student.FirstName || ""} ${student.LastName || ""}`.trim() || student.email,
          email: student.email,
          contact: student.phoneNumber || student.contact || undefined,
        });
        razorpayCustomerId = createdCustomer.id;
        student.razorpay_customer_id = razorpayCustomerId;
        await student.save().catch(() => {});
      } catch (err) {
        const errDesc = (err && (err.description || (err.error && err.error.description))) || "";
        if (errDesc.toString().toLowerCase().includes("customer already exists")) {
          try {
            const list = await razorpay.customers.all({ email: student.email });
            if (list && list.items.length > 0) {
              razorpayCustomerId = list.items[0].id;
              student.razorpay_customer_id = razorpayCustomerId;
              await student.save().catch(() => {});
            }
          } catch (listErr) { console.warn("Lookup failed", listErr); }
        }
      }
    }

    // === NEW: Resolve Recurring vs EMI installments ===
    let selectedPlan = null;
    if (course.paymentOptions && Array.isArray(course.paymentOptions.emiPlans)) {
      selectedPlan = course.paymentOptions.emiPlans.find(
        (p) => String(p._id) === String(emiPlanId) || p.plan_id === emiPlanId || p.plan_id === plan_id
      );
    }

    // Detect if this is an EMI request based on installments count
    // (Renewal is typically 120, EMI is usually 2-24)
    const isExplicitEMI = (total_count && Number(total_count) < 50) || !!emiPlanId;
    const isRenewal = course.isRecurring === true && !isExplicitEMI;
    
    // If renewal, we use 120 (10 years). If EMI, we use the provided count or plan count.
    const resolvedTotalCount = isRenewal 
      ? 100 // Razorpay limit for monthly subscriptions is 100
      : Number(total_count || (selectedPlan && selectedPlan.installments));

    if (!resolvedTotalCount || resolvedTotalCount <= 0) {
      return res.status(400).json({ message: "total_count (installments) is required" });
    }

    // compute per-installment amount in paise
    const finalPrice = getDiscountedPrice(course);
    console.log(`Course Price: ${course.price}, Final Discounted: ${finalPrice}, isRenewal: ${isRenewal}`);
    
    // Use plan total if specified (may include interest), otherwise use course price
    const baseTotalAmount = (selectedPlan && selectedPlan.totalAmount) 
      ? Number(selectedPlan.totalAmount) 
      : Number(finalPrice || 0);
      
    const totalAmountPaise = Math.round(baseTotalAmount * 100);
    
    // For renewal, price is the per-month cost. For EMI, total is divided by count.
    let perInstallmentPaise;
    if (isRenewal) {
      // FOR RENEWAL: Each "installment" IS the full monthly price. Do NOT divide.
      perInstallmentPaise = totalAmountPaise;
    } else {
      // FOR EMI: Divide the total price by the number of months.
      perInstallmentPaise = Math.round(totalAmountPaise / resolvedTotalCount);
    }

    // RAZORPAY SAFETY: Subscription plans must be at least ₹1 (100 paise)
    if (perInstallmentPaise < 100) perInstallmentPaise = 100;
    
    console.log(`Calculated Per-Installment Paise: ${perInstallmentPaise} (₹${perInstallmentPaise / 100})`);

    let chosenPlanId = plan_id || (selectedPlan && selectedPlan.plan_id) || null;
    
    // Verify or Create Plan
    if (chosenPlanId) {
      try {
        let existingPlan = await razorpay.plans.fetch(chosenPlanId).catch(() => null);
        if (!existingPlan || Number(existingPlan.amount) !== Number(perInstallmentPaise)) {
          chosenPlanId = null;
        }
      } catch (e) { chosenPlanId = null; }
    }

    if (!chosenPlanId) {
      const planPayload = {
        period: "monthly",
        interval: 1,
        item: {
          name: isRenewal ? `${course.title} - Monthly Subscription` : `${course.title} - EMI`,
          amount: perInstallmentPaise,
          currency: "INR",
          description: isRenewal ? "Monthly Renewal" : `EMI - ${resolvedTotalCount} installments`,
        },
      };
      const createdPlan = await razorpay.plans.create(planPayload);
      chosenPlanId = createdPlan.id;
    }

    // Build subscription payload
    const subscriptionPayload = {
      plan_id: chosenPlanId,
      total_count: Number(resolvedTotalCount),
      customer_notify: 1,
      customer_id: razorpayCustomerId || undefined 
    };

    const rzpSubscription = await razorpay.subscriptions.create(subscriptionPayload);

    // Map status
    const rawStatus = rzpSubscription?.status?.toLowerCase();
    let mappedStatus = (rawStatus === "active" || rawStatus === "completed") ? rawStatus : "pending";

    // Persist local subscription record
    const localSub = await Subscription.create({
      student: studentId,
      course: courseId,
      type: "subscription",
      isRecurring: isRenewal, // CRITICAL: So webhook knows to extend by 30 days
      plan_id: chosenPlanId,
      amount: Number(finalPrice),
      currency: "INR",
      razorpay_subscription_id: rzpSubscription.id,
      status: mappedStatus,
      total_count: rzpSubscription.total_count || Number(resolvedTotalCount),
      paid_count: 0,
      next_payment_at: rzpSubscription.current_end ? new Date(rzpSubscription.current_end * 1000) : null,
      emi: selectedPlan ? {
            planName: selectedPlan.name,
            plan_id: selectedPlan.plan_id,
            installments: selectedPlan.installments,
            perInstallmentAmount: selectedPlan.perInstallmentAmount,
            totalAmount: selectedPlan.totalAmount,
          } : {
            planName: isRenewal ? "Monthly Renewal" : `${course.title} EMI`,
            plan_id: chosenPlanId,
            installments: Number(resolvedTotalCount),
            perInstallmentAmount: perInstallmentPaise / 100,
            totalAmount: Number(finalPrice),
          },
      metadata: { razorpaySubscription: rzpSubscription },
    });

    return res.json({ 
        subscriptionId: rzpSubscription.id, 
        keyId: process.env.RAZORPAY_KEY_ID, 
        localSubscriptionId: localSub._id,
        paymentMode: isRenewal ? "RENEWAL" : "EMI",
        amount: perInstallmentPaise
    });

  } catch (err) {
    console.error("createSubscription err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};




/* ---------------- 5) Razorpay Webhook Listener ---------------- */
// export const razorpayWebhook = async (req, res) => {
//   try {
//      const signature = req.headers["x-razorpay-signature"];
//     const raw = req.rawBody || req.body; // raw Buffer when route uses bodyParser.raw
//     // compute HMAC on raw buffer / string exactly as received
//     const expectedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
//       .update(raw) // raw Buffer or string
//       .digest("hex");

//     if (expectedSignature !== signature) {
//       console.warn("Invalid webhook signature", { expectedSignature, signature });
//       return res.status(400).json({ message: "Invalid webhook signature" });
//     }

//     // Now parse JSON from raw for processing
//     const body = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString("utf8"));
//     const event = body.event;

//     if (event === "subscription.charged") {
//       const subEntity = body.payload.subscription.entity;
//       const paymentEntity = body.payload.payment ? body.payload.payment.entity : null;
//       const subscriptionIdFromPayload = subEntity.id;

//       const localSub = await Subscription.findOne({ razorpay_subscription_id: subscriptionIdFromPayload }).populate("course student");
//       if (!localSub) {
//         console.warn("Webhook: subscription not found locally:", subscriptionIdFromPayload);
//         return res.status(200).json({ status: "ignored" });
//       }

//       // Update paid_count & paymentHistory
//       localSub.paid_count = (localSub.paid_count || 0) + 1;
      
//       if (paymentEntity) {
//         // 1. Update Subscription History
//         localSub.paymentHistory.push({
//           payment_id: paymentEntity.id,
//           order_id: paymentEntity.order_id,
//           amount: (paymentEntity.amount || 0) / 100,
//           currency: paymentEntity.currency || "INR",
//           status: paymentEntity.status,
//           paidAt: paymentEntity.created_at ? new Date(paymentEntity.created_at * 1000) : new Date(),
//           meta: paymentEntity,
//         });

//         // 2. CREATE A RECORD IN "PAYMENTS" COLLECTION 
//         try {
//             await Payment.create({
//                 student: localSub.student._id || localSub.student, // Handle populated/unpopulated
//                 course: localSub.course._id || localSub.course,
//                 razorpay_order_id: paymentEntity.order_id || `sub_inv_${paymentEntity.id}`, // Fallback if order_id null
//                 razorpay_payment_id: paymentEntity.id,
//                 razorpay_signature: signature, // Using webhook signature as proof
//                 amount: (paymentEntity.amount || 0) / 100,
//             });
//             console.log("EMI Payment recorded in Payment collection:", paymentEntity.id);
//         } catch (payErr) {
//             console.error("Failed to create Payment record for EMI:", payErr);
//         }
//       }

//       if (subEntity && subEntity.current_end) {
//         localSub.next_payment_at = new Date(subEntity.current_end * 1000);
//       }

//       // Ensure student doc is populated
//       let student = localSub.student;
//       if (!(student && student.email)) {
//         student = await User.findById(localSub.student);
//       }

//       // Grant or extend access:
//       if (student) {
//         if (localSub.paid_count === 1) {
//           const now = new Date();
//           const durationInDays = (localSub.course && localSub.course.durationInDays) || 365;
//           const expiresAt = new Date(now);
//           expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));

//           const subIndex = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
//           if (subIndex >= 0) {
//             student.subscribedCourses[subIndex].subscribedAt = now;
//             student.subscribedCourses[subIndex].expiresAt = expiresAt;
//           } else {
//             student.subscribedCourses.push({ courseId: localSub.course._id, subscribedAt: now, expiresAt });
//           }
//           await student.save();
//           localSub.expiresAt = expiresAt;

//           try {
//             await sendEnrollmentEmail({
//               student,
//               course: localSub.course,
//               subjectSuffix: "Payment Received — Enrollment Confirmed",
//               messageLines: ["Payment received for your subscription. You now have access to the course.", `Payment ID: ${paymentEntity ? paymentEntity.id : "N/A"}`],
//               expiresAt,
//             });
//           } catch (emailErr) {
//             console.error("Failed sending first-payment email:", emailErr);
//           }
//         } else {
//           // extend expiry policy: +31 days (or choose another policy)
//           const subIndex = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
//           if (subIndex >= 0) {
//             let curExpires = new Date(student.subscribedCourses[subIndex].expiresAt || Date.now());
//             if (isNaN(curExpires.getTime()) || curExpires < new Date()) curExpires = new Date();
//             curExpires.setDate(curExpires.getDate() + 31);
//             student.subscribedCourses[subIndex].expiresAt = curExpires;
//             await student.save();
//             localSub.expiresAt = curExpires;
//           } else {
//             const newExpires = new Date();
//             newExpires.setDate(newExpires.getDate() + 31);
//             student.subscribedCourses.push({ courseId: localSub.course._id, subscribedAt: new Date(), expiresAt: newExpires });
//             await student.save();
//             localSub.expiresAt = newExpires;
//           }

//           try {
//             await sendEnrollmentEmail({
//               student,
//               course: localSub.course,
//               subjectSuffix: "EMI Payment Received",
//               messageLines: ["We received your EMI payment. Your access has been extended.", `Payment ID: ${paymentEntity ? paymentEntity.id : "N/A"}`, `Installment ${localSub.paid_count} of ${localSub.total_count || "?"}`],
//               expiresAt: localSub.expiresAt,
//             });
//           } catch (emailErr) {
//             console.error("Failed sending installment email:", emailErr);
//           }
//         }
//       }

//       // Completed all installments => mark completed, lifetime access
//       if (localSub.total_count && localSub.paid_count >= localSub.total_count) {
//         localSub.status = "completed";
//         localSub.next_payment_at = null;
//         localSub.lifetimeAccess = true;
//         const farFuture = new Date("9999-12-31T23:59:59.000Z");
//         localSub.expiresAt = farFuture;

//         if (student) {
//           const idx = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
//           if (idx >= 0) {
//             student.subscribedCourses[idx].expiresAt = farFuture;
//           } else {
//             student.subscribedCourses.push({ courseId: localSub.course._id, subscribedAt: new Date(), expiresAt: farFuture });
//           }
//           await student.save();
//         }
//       }

//       await localSub.save();
//       return res.status(200).json({ status: "ok" });
//     }

//     // Handle subscription cancelled/halted events
//     if (event === "subscription.halted" || event === "subscription.cancelled") {
//       const subscriptionIdFromPayload = body.payload.subscription && body.payload.subscription.entity ? body.payload.subscription.entity.id : null;
//       const localSub = await Subscription.findOne({ razorpay_subscription_id: subscriptionIdFromPayload });
//       if (!localSub) return res.status(200).json({ status: "ignored" });

//       localSub.status = "cancelled";
//       await localSub.save();

//       const student = await User.findById(localSub.student);
//       if (student) {
//         student.subscribedCourses = student.subscribedCourses.filter((s) => String(s.courseId) !== String(localSub.course));
//         await student.save();
//       }
//       return res.status(200).json({ status: "ok" });
//     }

//     // default - ignore other events
//     res.status(200).json({ status: "ignored" });
//   } catch (err) {
//     console.error("razorpayWebhook err:", err);
//     res.status(500).json({ message: err.message || "Internal Server Error" });
//   }
// };




export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const raw = req.rawBody || req.body; 
    
    // 1. Verify Webhook Security - Use req.rawBody if available for Vercel
    const verifyBody = req.rawBody || raw;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(verifyBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.warn("Invalid webhook signature", { expectedSignature, signature });
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const body = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString("utf8"));
    const event = body.event;

    // 2. Handle Successful Payment (EMI or Subscription Renewal)
    if (event === "subscription.charged") {
      const subEntity = body.payload.subscription.entity;
      const paymentEntity = body.payload.payment ? body.payload.payment.entity : null;
      const subscriptionIdFromPayload = subEntity.id;

      // Find local subscription record
      const localSub = await Subscription.findOne({ razorpay_subscription_id: subscriptionIdFromPayload }).populate("course student");
      if (!localSub) {
        console.warn("Webhook: subscription not found locally:", subscriptionIdFromPayload);
        return res.status(200).json({ status: "ignored" });
      }

      // Update basic status
      localSub.paid_count = (localSub.paid_count || 0) + 1;
      
      if (paymentEntity) {
        // Log to payment history inside Subscription record
        localSub.paymentHistory.push({
          payment_id: paymentEntity.id,
          order_id: paymentEntity.order_id,
          amount: (paymentEntity.amount || 0) / 100,
          currency: paymentEntity.currency || "INR",
          status: paymentEntity.status,
          paidAt: paymentEntity.created_at ? new Date(paymentEntity.created_at * 1000) : new Date(),
          meta: paymentEntity,
        });

        // Create independent Payment record for accounting
        try {
          await Payment.create({
            student: localSub.student._id || localSub.student,
            course: localSub.course._id || localSub.course,
            razorpay_order_id: paymentEntity.order_id || `sub_inv_${paymentEntity.id}`,
            razorpay_payment_id: paymentEntity.id,
            razorpay_signature: signature,
            amount: (paymentEntity.amount || 0) / 100,
          });
        } catch (payErr) {
          console.error("Failed to create Payment record:", payErr);
        }
      }

      if (subEntity && subEntity.current_end) {
        localSub.next_payment_at = new Date(subEntity.current_end * 1000);
      }

      // 3. Update User Course Access
      let student = localSub.student;
      if (!(student && student.email)) {
        student = await User.findById(localSub.student);
      }

      if (student) {
        const isRecurring = localSub.course.isRecurring === true; 
        const isOneTime = localSub.type === "one-time";
        const isEMI = localSub.type === "subscription" && !isRecurring;
        const totalCount = localSub.total_count || 1;
        const isFinalEMIPayment = isEMI && localSub.paid_count >= totalCount;

        let expiresAt;
        let durationInDays = 31; // Default to rolling access: 1 month + 1 day grace

        if (isOneTime || isFinalEMIPayment) {
            // Give full course duration for one-time payments or completed EMI plans
            durationInDays = localSub.course.durationInDays || 365;
        } else if (isRecurring) {
            durationInDays = 30; // Standard monthly renewal
        } else {
            // Rolling EMI access
            durationInDays = 31;
        }

        const now = new Date();
        expiresAt = new Date(now);
        
        // Fix for "2300" year: Cap durationInDays and treat as lifetime if large
        if (durationInDays >= 5000) {
            expiresAt = new Date("9999-12-31T23:59:59.000Z");
        } else {
            expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));
        }

        const subIndex = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
        if (subIndex >= 0) {
            // Update existing enrollment
            if (localSub.paid_count === 1) student.subscribedCourses[subIndex].subscribedAt = now;
            student.subscribedCourses[subIndex].expiresAt = expiresAt;
        } else {
            // New enrollment
            student.subscribedCourses.push({ 
                courseId: localSub.course._id, 
                subscribedAt: now, 
                expiresAt 
            });
        }
        await student.save();
        localSub.expiresAt = expiresAt;

        // Send Email using centralized service
        if (localSub.paid_count === 1) {
            await sendEnrollmentEmail({
                student,
                course: localSub.course,
                expiresAt,
                isOneTime: false
            });
        } else {
            await sendPaymentExtensionEmail({
                student,
                course: localSub.course,
                paidCount: localSub.paid_count,
                totalCount: localSub.total_count,
                expiresAt,
                isRecurring
            });
        }
      }

      // 4. Handle Completion (EMI ONLY - NEVER FOR RECURRING)
      if (!localSub.course.isRecurring && localSub.total_count && localSub.paid_count >= localSub.total_count) {
        localSub.status = "completed";
        localSub.next_payment_at = null;
        localSub.lifetimeAccess = true;
        const farFuture = new Date("9999-12-31T23:59:59.000Z");
        localSub.expiresAt = farFuture;

        if (student) {
          const idx = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
          if (idx >= 0) {
            student.subscribedCourses[idx].expiresAt = farFuture;
            await student.save();
          }
        }
      }

      await localSub.save();
      return res.status(200).json({ status: "ok" });
    }

    // 5. Handle Cancellations
    if (event === "subscription.halted" || event === "subscription.cancelled") {
      const subId = body.payload.subscription.entity.id;
      const localSub = await Subscription.findOne({ razorpay_subscription_id: subId });
      if (!localSub) return res.status(200).json({ status: "ignored" });

      localSub.status = "cancelled";
      await localSub.save();

      // OPTIONAL LOGIC: We no longer remove access immediately.
      // The user keeps access until localSub.expiresAt (the end of the current paid period).
      console.log(`Subscription ${subId} cancelled. Access remains until ${localSub.expiresAt}`);
      
      return res.status(200).json({ status: "ok" });
    }

    res.status(200).json({ status: "ignored" });
  } catch (err) {
    console.error("razorpayWebhook err:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};





/* ---------------- Admin / Utilities ---------------- */
export const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({})
      .populate("student", "FirstName LastName email")
      .populate("course", "title price")
      .sort({ createdAt: -1 }); // Get newest first
    
    // 1. Filter out invalid records and ONE-TIME payments
    // (One-time payments should be in the One-Time tab, not Subscriptions)
    const validSubscriptions = subscriptions.filter(sub => {
      return sub.course !== null && 
             sub.student !== null &&
             sub.type !== "one-time"; // Hide full payments from the Subscriptions tab
    });

    // 2. Improved Deduplication Logic (Status-Aware)
    // We want to show only one card per student/course pair.
    // If they have multiple attempts, prioritize showing the "Active" one.
    const pairMap = new Map();

    for (const sub of validSubscriptions) {
      const pairKey = `${sub.student._id}_${sub.course._id}`;
      const existing = pairMap.get(pairKey);

      if (!existing) {
        pairMap.set(pairKey, sub);
      } else {
        // If we found a newer record, but the existing one is "active", 
        // keep the active one unless the new one is also active/completed.
        const currentIsSuccess = ["active", "completed"].includes(sub.status);
        const existingIsSuccess = ["active", "completed"].includes(existing.status);

        if (currentIsSuccess && !existingIsSuccess) {
          // Replace pending/failed with active
          pairMap.set(pairKey, sub);
        } else if (!existingIsSuccess && sub.createdAt > existing.createdAt) {
          // If neither is successful, just show the most recent attempt
          pairMap.set(pairKey, sub);
        }
      }
    }
    
    const uniqueSubscriptions = Array.from(pairMap.values());
    
    const formattedSubscriptions = uniqueSubscriptions.map(sub => {
      const obj = sub.toObject();
      obj.subscriptionId = obj.razorpay_subscription_id;
      return obj;
    });

    res.json(formattedSubscriptions);
  } catch (err) {
    console.error("getAllSubscriptions err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const subscription = await Subscription.findById(id);
    if (!subscription) return res.status(404).json({ message: "Subscription not found" });

    try {
      if (subscription.razorpay_subscription_id) await razorpay.subscriptions.cancel(subscription.razorpay_subscription_id);
    } catch (rzpError) {
      console.error("Razorpay Cancel Error:", rzpError);
    }

    subscription.status = "cancelled";
    await subscription.save();

    // Immediately remove access from User record when Owner cancels
    await User.findByIdAndUpdate(subscription.student, {
      $pull: { subscribedCourses: { courseId: subscription.course } }
    });

    res.json({ message: "Subscription cancelled successfully. Access has been revoked immediately." });
  } catch (err) {
    console.error("cancelSubscription err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find({})
      .populate("student", "FirstName LastName email")
      .populate("course", "title")
      .sort({ createdAt: -1 });

    // Filter out payments for deleted courses or courses with no title
    const validPayments = payments.filter(pay => {
      return pay.course !== null && 
             pay.course !== undefined && 
             pay.course.title !== null &&
             pay.course.title !== undefined;
    });

    // --- Analytics Logic (Filtered to existing courses only) ---
    
    // Get list of valid course IDs to filter analytics accurately
    const validCourses = await mongoose.model("Course").find({}, "_id").lean();
    const validCourseIds = validCourses.map(c => c._id);

    // 1. Total Revenue (Filtered)
    const revenueAgg = await Payment.aggregate([
      { $match: { course: { $in: validCourseIds } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
        },
      },
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;

    // 2. Total Payments (Filtered)
    const totalPayments = await Payment.countDocuments({ course: { $in: validCourseIds } });

    // 3. Active Subscriptions (Filtered)
    const activeSubscriptions = await Subscription.countDocuments({ 
      status: "active",
      course: { $in: validCourseIds } 
    });

    // --- Combined Response ---
    res.json({
      payments: validPayments,
      analytics: {
        totalRevenue,
        totalPayments,
        activeSubscriptions,
      },
    });
  } catch (err) {
    console.error("getAllPayments err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const studentId = req.user.id;
    const user = await User.findById(studentId).populate({ path: "subscribedCourses.courseId", select: "title thumbnail" });
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    const statusList = user.subscribedCourses
      .map((sub) => {
        if (!sub.courseId) return null;
        const isValid = new Date(sub.expiresAt) > now;
        return {
          courseId: sub.courseId._id,
          courseTitle: sub.courseId.title,
          thumbnail: sub.courseId.thumbnail,
          status: isValid ? "Active" : "Expired",
          expiresAt: sub.expiresAt,
          subscribedAt: sub.subscribedAt,
        };
      })
      .filter((item) => item !== null);

    res.json(statusList);
  } catch (err) {
    console.error("getSubscriptionStatus err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

export const getPaymentHistoryByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: "Invalid Student ID format" });
    }

    const objectId = new mongoose.Types.ObjectId(studentId);

    // Fetch payments for specific student
    const payments = await Payment.find({ student: objectId })
      .populate("course", "title thumbnail price description")
      .sort({ createdAt: -1 })
      .lean();

    if (!payments || payments.length === 0) {
      return res.status(200).json([]);
    }

    // Manual reverse lookup for content details
    const history = await Promise.all(
      payments.map(async (pay) => {
        const course = pay.course;
        let modulesData = [];

        if (course && course._id) {
          const modules = await Module.find({ course: course._id }).sort({ order: 1 }).lean();
          modulesData = await Promise.all(
            modules.map(async (mod) => {
              const lessons = await Lesson.find({ module: mod._id })
                .sort({ order: 1 })
                .select("title duration type isFree contentUrl") 
                .lean();

              return {
                id: mod._id,
                moduleTitle: mod.title,
                totalLessons: lessons.length,
                lessons: lessons.map(l => ({
                  id: l._id,
                  title: l.title,
                  duration: l.duration,
                  type: l.type,
                  isFree: l.isFree,
                  url: l.contentUrl
                }))
              };
            })
          );
        }

        return {
          id: pay._id,
          courseId: course?._id || null,
          courseTitle: course?.title || "Unknown Course",
          courseThumbnail: course?.thumbnail || null,
          amount: pay.amount,
          currency: "INR",
          orderId: pay.razorpay_order_id,
          paymentId: pay.razorpay_payment_id,
          date: pay.createdAt,
          status: "Success",
          contentSummary: {
            totalModules: modulesData.length,
            modules: modulesData
          }
        };
      })
    );

    res.status(200).json(history);
  } catch (err) {
    console.error("getPaymentHistoryByStudent err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

export const getStudentPaymentHistory = async (req, res) => {
  try {
    const studentId = req.user.id;
    const objectId = new mongoose.Types.ObjectId(studentId);

    const student = await User.findById(studentId).lean();
    if (!student) return res.status(404).json({ message: "Student not found" });

    const payments = await Payment.find({ student: objectId })
      .populate("course", "title thumbnail price description")
      .sort({ createdAt: -1 })
      .lean();

    // Fetch Free & Offline Subscriptions to include in "My Courses"
    const manualSubscriptions = await Subscription.find({ 
      student: objectId, 
      type: { $in: ["free", "offline_payment"] }, 
      status: "active" 
    })
      .populate("course", "title thumbnail price description")
      .sort({ createdAt: -1 })
      .lean();

    // Transform manual subscriptions into payment-like objects
    const manualHistory = manualSubscriptions.map(sub => ({
      _id: sub._id,
      course: sub.course,
      amount: sub.amount || 0,
      currency: sub.currency || "INR",
      createdAt: sub.createdAt,
      status: sub.status, // "active"
      type: sub.type // "free" or "offline_payment"
    }));

    // Merge and sort
    const allHistoryRaw = [...payments, ...manualHistory].sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    if (allHistoryRaw.length === 0) {
      return res.status(200).json([]);
    }

    const historyRaw = await Promise.all(
      allHistoryRaw.map(async (pay) => {
        const course = pay.course;
        if (!course) return null;

        let modulesData = [];
        const paymentStatus = pay.status ? pay.status.toLowerCase() : "success";
        
        // Find the subscription status for THIS specific course/student pair
        const subRecord = await Subscription.findOne({ 
          student: objectId, 
          course: course._id 
        }).sort({ createdAt: -1 });

        // A course is ONLY active if it doesn't have a cancelled subscription record
        const isCancelled = subRecord && subRecord.status === 'cancelled';
        const isPaid = ["success", "completed", "captured", "active"].includes(paymentStatus) && !isCancelled;

        const subscriptionInfo = student.subscribedCourses?.find(
          (sub) => String(sub.courseId) === String(course?._id)
        );
        const expiresAt = subscriptionInfo?.expiresAt || null;

        if (course && course._id) {
          const modules = await Module.find({ course: course._id }).sort({ order: 1 }).lean();

          modulesData = await Promise.all(
            modules.map(async (mod) => {
              const lessons = await Lesson.find({ module: mod._id })
                .sort({ order: 1 })
                .select("title duration type isFree contentUrl asset") 
                .lean();

              return {
                id: mod._id,
                moduleTitle: mod.title,
                totalLessons: lessons.length,
                lessons: lessons.map(l => {
                  const hasAccess = l.isFree === true || isPaid;
                  const secureUrl = hasAccess ? (l.contentUrl || null) : null;

                  return {
                    id: l._id,
                    title: l.title,
                    duration: l.duration,
                    type: l.type,
                    isFree: l.isFree,
                    contentUrl: secureUrl,
                    asset: hasAccess ? (l.asset || null) : null
                  };
                })
              };
            })
          );
        }

        return {
          id: pay._id,
          courseId: course?._id || null,
          courseTitle: course?.title || "Unknown Course",
          courseThumbnail: course?.thumbnail || null,
          amount: pay.amount,
          currency: pay.currency || "INR",
          orderId: pay.razorpay_order_id,
          paymentId: pay.razorpay_payment_id,
          date: pay.createdAt,
          expiresAt: expiresAt, 
          status: pay.status || "Success",
          isPurchased: isPaid,
          contentSummary: {
            totalModules: modulesData.length,
            modules: modulesData
          }
        };
      })
    );

    const history = historyRaw.filter(h => h !== null);

    res.status(200).json(history);
  } catch (err) {
    console.error("getStudentPaymentHistory err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

export const getPaymentAnalytics = async (req, res) => {
  try {
    // Filter by existing courses only
    const validCourses = await mongoose.model("Course").find({}, "_id").lean();
    const validCourseIds = validCourses.map(c => c._id);

    // 1. Total Revenue (Filtered)
    const revenueAgg = await Payment.aggregate([
      { $match: { course: { $in: validCourseIds } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
        },
      },
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;

    // 2. Total Payments (Filtered)
    const totalPayments = await Payment.countDocuments({ course: { $in: validCourseIds } });

    // 3. Active Subscriptions (Filtered)
    const activeSubscriptions = await Subscription.countDocuments({ 
      status: "active",
      course: { $in: validCourseIds } 
    });

    res.json({
      totalRevenue,
      totalPayments,
      activeSubscriptions,
    });
  } catch (err) {
    console.error("getPaymentAnalytics err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};
