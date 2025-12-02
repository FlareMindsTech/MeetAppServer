import crypto from "crypto";
import { razorpay } from "../config/razorpayClient.js";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import Payment from "../Model/payment.js";
import Subscription from "../Model/subscription.js";
import transporter from "./transporter.js";

/* ---------------- Helper: Email ---------------- */
async function sendEnrollmentEmail({ student, course, subjectSuffix, messageLines = [], expiresAt = null }) {
  try {
    const expiryDateString = expiresAt ? new Date(expiresAt).toLocaleDateString("en-US") : "N/A";
    const htmlLines = `
      <p>Hello ${student.FirstName || student.email},</p>
      ${messageLines.map((l) => `<p>${l}</p>`).join("")}
      <p><b>Course:</b> ${course.title}</p>
      <p><b>Access Expires:</b> ${expiryDateString}</p>
    `;
    await transporter.sendMail({
      from: `"SathyaGomani Academy" <${process.env.EMAIL_USER}>`,
      to: student.email,
      subject: `${course.title} - ${subjectSuffix}`,
      html: htmlLines,
    });
  } catch (err) {
    console.error("sendEnrollmentEmail failed:", err);
  }
}

/* ---------------- 1) Initiate Payment wrapper ---------------- */
export const initiatePayment = async (req, res) => {
  try {
    console.log("initiatePayment body:", req.body);
    const { type, paymentOption, plan_id } = req.body || {};

    const isSubscription =
      (typeof type === "string" && type.toLowerCase() === "subscription") ||
      (typeof paymentOption === "string" && paymentOption.toLowerCase() === "emi") ||
      !!plan_id;

    if (isSubscription) return createSubscription(req, res);
    return createOrder(req, res);
  } catch (err) {
    console.error("initiatePayment err:", err);
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

    const amountInPaise = Math.round(Number(course.price || 0) * 100);
    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    await Subscription.create({
      student: student._id,
      course: course._id,
      type: "one-time",
      amount: Number(course.price),
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

    await Payment.create({ student: studentId, course: courseId, razorpay_order_id, razorpay_payment_id, razorpay_signature, amount: course.price });

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
            amount: course.price,
            currency: "INR",
            status: "paid",
            paidAt: new Date(),
          },
        },
        expiresAt, 
      },
      { upsert: true, new: true }
    );

    await sendEnrollmentEmail({
      student,
      course,
      subjectSuffix: "Payment Successful & Enrollment Confirmed",
      messageLines: [accessMessage, `Receipt ID: ${razorpay_payment_id}`],
      expiresAt,
    });

    res.status(200).json({ message: "Payment successful! Course access granted." });
  } catch (err) {
    console.error("verifyPayment err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

/* ---------------- 4) Create Subscription (EMI) ---------------- */
export const createSubscription = async (req, res) => {
  try {
    const { plan_id, courseId, emiPlanId, total_count } = req.body;
    const studentId = req.user.id;
    if (!courseId) return res.status(400).json({ message: "courseId is required" });

    const student = await User.findById(studentId);
    const course = await Course.findById(courseId);
    if (!student || !course) return res.status(404).json({ message: "Student or Course not found" });

    // === Create-or-find Razorpay customer and store id on user ===
    let razorpayCustomerId = student.razorpay_customer_id || null;
    if (!razorpayCustomerId) {
      try {
        const createdCustomer = await razorpay.customers.create({
          name: `${student.FirstName || ""} ${student.LastName || ""}`.trim() || student.email,
          email: student.email,
          contact: student.contact || undefined,
        });
        razorpayCustomerId = createdCustomer.id;
        student.razorpay_customer_id = razorpayCustomerId;
        await student.save().catch(() => {});
        console.log("Created new Razorpay customer:", razorpayCustomerId);
      } catch (err) {
        // If customer already exists, attempt to find and reuse
        const errDesc = (err && (err.description || (err.error && err.error.description))) || "";
        if (errDesc.toString().toLowerCase().includes("customer already exists")) {
          try {
            if (typeof razorpay.customers.all === "function") {
              const list = await razorpay.customers.all({ email: student.email });
              if (list && Array.isArray(list.items) && list.items.length > 0) {
                razorpayCustomerId = list.items[0].id;
                student.razorpay_customer_id = razorpayCustomerId;
                await student.save().catch(() => {});
                console.log("Reused existing razorpay customer id:", razorpayCustomerId);
              } else {
                console.warn("Customer exists but customers.all returned none for email:", student.email);
              }
            } else {
              // Fallback REST lookup by email
              const resp = await fetch(
                `https://api.razorpay.com/v1/customers?email=${encodeURIComponent(student.email)}`,
                {
                  headers: {
                    Authorization:
                      "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64"),
                    "Content-Type": "application/json",
                  },
                }
              );
              if (resp.ok) {
                const data = await resp.json();
                if (data && Array.isArray(data.items) && data.items.length > 0) {
                  razorpayCustomerId = data.items[0].id;
                  student.razorpay_customer_id = razorpayCustomerId;
                  await student.save().catch(() => {});
                  console.log("Reused existing razorpay customer id (REST):", razorpayCustomerId);
                } else {
                  console.warn("No customer found via REST lookup for email:", student.email);
                }
              } else {
                console.warn("Razorpay REST customer lookup failed with status:", resp.status);
              }
            }
          } catch (listErr) {
            console.warn("Failed to lookup existing Razorpay customer:", listErr);
          }
        } else {
          console.warn("Could not create razorpay customer (continuing):", err && err.error ? err.error : err);
        }
        // continue even if we couldn't get a customer id
      }
    }

    // === Resolve plan and installments ===
    let selectedPlan = null;
    if (course.paymentOptions && Array.isArray(course.paymentOptions.emiPlans)) {
      selectedPlan = course.paymentOptions.emiPlans.find(
        (p) => String(p._id) === String(emiPlanId) || p.plan_id === emiPlanId || p.plan_id === plan_id
      );
    }

    const finalPlanIdInput = plan_id || (selectedPlan && selectedPlan.plan_id);
    const resolvedTotalCount = Number(total_count || (selectedPlan && selectedPlan.installments));

    if (!resolvedTotalCount || resolvedTotalCount <= 0) {
      return res.status(400).json({ message: "total_count (installments) is required and must be > 0" });
    }

    // compute per-installment amount in paise
    const totalAmountPaise = Math.round(Number(course.price || 0) * 100);
    const perInstallmentPaise = Math.round(totalAmountPaise / resolvedTotalCount); // simple rounding strategy

    // If a plan_id was provided, verify its amount matches per-installment amount;
    // if not matching, we'll create a plan for this per-installment amount.
    let chosenPlanId = finalPlanIdInput || null;
    if (chosenPlanId) {
      try {
        // Try SDK fetch first (may differ by SDK version)
        let existingPlan = null;
        if (typeof razorpay.plans.fetch === "function") {
          existingPlan = await razorpay.plans.fetch(chosenPlanId).catch(() => null);
        } else {
          // fallback REST GET /v1/plans/:id
          const resp = await fetch(`https://api.razorpay.com/v1/plans/${chosenPlanId}`, {
            headers: {
              Authorization: "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64"),
              "Content-Type": "application/json",
            },
          });
          if (resp.ok) existingPlan = await resp.json().catch(() => null);
        }

        if (!existingPlan || Number(existingPlan.amount) !== Number(perInstallmentPaise)) {
          // Plan mismatch — don't reuse; create a new plan below
          chosenPlanId = null;
        }
      } catch (e) {
        chosenPlanId = null;
      }
    }

    if (!chosenPlanId) {
      // Create a plan with amount = per-installment amount (paise)
      const planPayload = {
        period: "monthly", // choose billing period
        interval: 1,
        item: {
          name: `${course.title} - EMI (${resolvedTotalCount} installments)`,
          amount: perInstallmentPaise,
          currency: "INR",
          description: `EMI for ${course.title} — ${resolvedTotalCount} installments`,
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
      // If your account supports customer_id and you want Razorpay to email / attach instruments:
      // include customer_id: razorpayCustomerId
    };

    const rzpSubscription = await razorpay.subscriptions.create(subscriptionPayload);

    // Map raw status -> our enum
    const rawStatus = rzpSubscription && rzpSubscription.status ? String(rzpSubscription.status).toLowerCase() : null;
    let mappedStatus = "pending";
    if (rawStatus === "active") mappedStatus = "active";
    else if (rawStatus === "completed") mappedStatus = "completed";
    else mappedStatus = "pending";

    // Persist local subscription record (do NOT grant access here)
    const localSub = await Subscription.create({
      student: studentId,
      course: courseId,
      type: "subscription",
      plan_id: chosenPlanId,
      amount: Number(course.price),
      currency: "INR",
      razorpay_subscription_id: rzpSubscription.id,
      status: mappedStatus,
      total_count: rzpSubscription.total_count || Number(resolvedTotalCount),
      paid_count: 0,
      next_payment_at: rzpSubscription.current_end ? new Date(rzpSubscription.current_end * 1000) : null,
      expiresAt: null,
      emi: selectedPlan
        ? {
            planName: selectedPlan.name,
            plan_id: selectedPlan.plan_id,
            installments: selectedPlan.installments,
            perInstallmentAmount: selectedPlan.perInstallmentAmount,
            totalAmount: selectedPlan.totalAmount,
            interestPercent: selectedPlan.interestPercent,
          }
        : {
            planName: `${course.title} EMI`,
            plan_id: chosenPlanId,
            installments: Number(resolvedTotalCount),
            perInstallmentAmount: perInstallmentPaise / 100,
            totalAmount: Number(course.price),
          },
      metadata: { razorpaySubscription: rzpSubscription },
    });

    return res.json({ subscriptionId: rzpSubscription.id, keyId: process.env.RAZORPAY_KEY_ID, localSubscriptionId: localSub._id });
  } catch (err) {
    console.error("createSubscription err:", err);
    if (err && err.statusCode && err.error) {
      return res.status(err.statusCode).json({ message: err.error.description || err.error });
    }
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

/* ---------------- 5) Razorpay Webhook Listener ---------------- */
export const razorpayWebhook = async (req, res) => {
  try {
     const signature = req.headers["x-razorpay-signature"];
    const raw = req.rawBody || req.body; // raw Buffer when route uses bodyParser.raw
    // compute HMAC on raw buffer / string exactly as received
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(raw) // raw Buffer or string
      .digest("hex");

    if (expectedSignature !== signature) {
      console.warn("Invalid webhook signature", { expectedSignature, signature });
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    // Now parse JSON from raw for processing
    const body = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString("utf8"));
    const event = body.event;

    if (event === "subscription.charged") {
      const subEntity = body.payload.subscription.entity;
      const paymentEntity = body.payload.payment ? body.payload.payment.entity : null;
      const subscriptionIdFromPayload = subEntity.id;

      const localSub = await Subscription.findOne({ razorpay_subscription_id: subscriptionIdFromPayload }).populate("course student");
      if (!localSub) {
        console.warn("Webhook: subscription not found locally:", subscriptionIdFromPayload);
        return res.status(200).json({ status: "ignored" });
      }

      // Update paid_count & paymentHistory
      localSub.paid_count = (localSub.paid_count || 0) + 1;
      
      if (paymentEntity) {
        // 1. Update Subscription History
        localSub.paymentHistory.push({
          payment_id: paymentEntity.id,
          order_id: paymentEntity.order_id,
          amount: (paymentEntity.amount || 0) / 100,
          currency: paymentEntity.currency || "INR",
          status: paymentEntity.status,
          paidAt: paymentEntity.created_at ? new Date(paymentEntity.created_at * 1000) : new Date(),
          meta: paymentEntity,
        });

        // 2. CREATE A RECORD IN "PAYMENTS" COLLECTION 
        try {
            await Payment.create({
                student: localSub.student._id || localSub.student, // Handle populated/unpopulated
                course: localSub.course._id || localSub.course,
                razorpay_order_id: paymentEntity.order_id || `sub_inv_${paymentEntity.id}`, // Fallback if order_id null
                razorpay_payment_id: paymentEntity.id,
                razorpay_signature: signature, // Using webhook signature as proof
                amount: (paymentEntity.amount || 0) / 100,
            });
            console.log("EMI Payment recorded in Payment collection:", paymentEntity.id);
        } catch (payErr) {
            console.error("Failed to create Payment record for EMI:", payErr);
        }
      }

      if (subEntity && subEntity.current_end) {
        localSub.next_payment_at = new Date(subEntity.current_end * 1000);
      }

      // Ensure student doc is populated
      let student = localSub.student;
      if (!(student && student.email)) {
        student = await User.findById(localSub.student);
      }

      // Grant or extend access:
      if (student) {
        if (localSub.paid_count === 1) {
          const now = new Date();
          const durationInDays = (localSub.course && localSub.course.durationInDays) || 365;
          const expiresAt = new Date(now);
          expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));

          const subIndex = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
          if (subIndex >= 0) {
            student.subscribedCourses[subIndex].subscribedAt = now;
            student.subscribedCourses[subIndex].expiresAt = expiresAt;
          } else {
            student.subscribedCourses.push({ courseId: localSub.course._id, subscribedAt: now, expiresAt });
          }
          await student.save();
          localSub.expiresAt = expiresAt;

          try {
            await sendEnrollmentEmail({
              student,
              course: localSub.course,
              subjectSuffix: "Payment Received — Enrollment Confirmed",
              messageLines: ["Payment received for your subscription. You now have access to the course.", `Payment ID: ${paymentEntity ? paymentEntity.id : "N/A"}`],
              expiresAt,
            });
          } catch (emailErr) {
            console.error("Failed sending first-payment email:", emailErr);
          }
        } else {
          // extend expiry policy: +31 days (or choose another policy)
          const subIndex = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
          if (subIndex >= 0) {
            let curExpires = new Date(student.subscribedCourses[subIndex].expiresAt || Date.now());
            if (isNaN(curExpires.getTime()) || curExpires < new Date()) curExpires = new Date();
            curExpires.setDate(curExpires.getDate() + 31);
            student.subscribedCourses[subIndex].expiresAt = curExpires;
            await student.save();
            localSub.expiresAt = curExpires;
          } else {
            const newExpires = new Date();
            newExpires.setDate(newExpires.getDate() + 31);
            student.subscribedCourses.push({ courseId: localSub.course._id, subscribedAt: new Date(), expiresAt: newExpires });
            await student.save();
            localSub.expiresAt = newExpires;
          }

          try {
            await sendEnrollmentEmail({
              student,
              course: localSub.course,
              subjectSuffix: "EMI Payment Received",
              messageLines: ["We received your EMI payment. Your access has been extended.", `Payment ID: ${paymentEntity ? paymentEntity.id : "N/A"}`, `Installment ${localSub.paid_count} of ${localSub.total_count || "?"}`],
              expiresAt: localSub.expiresAt,
            });
          } catch (emailErr) {
            console.error("Failed sending installment email:", emailErr);
          }
        }
      }

      // Completed all installments => mark completed, lifetime access
      if (localSub.total_count && localSub.paid_count >= localSub.total_count) {
        localSub.status = "completed";
        localSub.next_payment_at = null;
        localSub.lifetimeAccess = true;
        const farFuture = new Date("9999-12-31T23:59:59.000Z");
        localSub.expiresAt = farFuture;

        if (student) {
          const idx = student.subscribedCourses.findIndex((s) => String(s.courseId) === String(localSub.course._id));
          if (idx >= 0) {
            student.subscribedCourses[idx].expiresAt = farFuture;
          } else {
            student.subscribedCourses.push({ courseId: localSub.course._id, subscribedAt: new Date(), expiresAt: farFuture });
          }
          await student.save();
        }
      }

      await localSub.save();
      return res.status(200).json({ status: "ok" });
    }

    // Handle subscription cancelled/halted events
    if (event === "subscription.halted" || event === "subscription.cancelled") {
      const subscriptionIdFromPayload = body.payload.subscription && body.payload.subscription.entity ? body.payload.subscription.entity.id : null;
      const localSub = await Subscription.findOne({ razorpay_subscription_id: subscriptionIdFromPayload });
      if (!localSub) return res.status(200).json({ status: "ignored" });

      localSub.status = "cancelled";
      await localSub.save();

      const student = await User.findById(localSub.student);
      if (student) {
        student.subscribedCourses = student.subscribedCourses.filter((s) => String(s.courseId) !== String(localSub.course));
        await student.save();
      }
      return res.status(200).json({ status: "ok" });
    }

    // default - ignore other events
    res.status(200).json({ status: "ignored" });
  } catch (err) {
    console.error("razorpayWebhook err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

/* ---------------- Admin / Utilities ---------------- */
export const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({}).populate("student", "FirstName LastName email").populate("course", "title price").sort({ createdAt: -1 });
    res.json(subscriptions);
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

    const student = await User.findById(subscription.student);
    if (student) {
      student.subscribedCourses = student.subscribedCourses.filter((sub) => String(sub.courseId) !== String(subscription.course));
      await student.save();
    }

    res.json({ message: "Subscription cancelled successfully" });
  } catch (err) {
    console.error("cancelSubscription err:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
};

export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find({}).populate("student", "FirstName LastName email").populate("course", "title").sort({ createdAt: -1 });
    res.json(payments);
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