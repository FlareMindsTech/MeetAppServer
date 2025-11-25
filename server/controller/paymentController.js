import crypto from "crypto";
import { razorpay } from "../config/razorpayClient.js";
import Course from "../Model/course.js";
import User from "../Model/userSchema.js";
import Payment from "../Model/payment.js";
import Subscription from "../Model/subscription.js";
import transporter from "./transporter.js";

// --- 1. INITIATE PAYMENT WRAPPER (Matches /payment/initiate) ---
export const initiatePayment = async (req, res) => {
  const { type } = req.body; // Expect 'one-time' or 'subscription'

  if (type === "subscription") {
    return createSubscription(req, res);
  } else {
    // Default to one-time order
    return createOrder(req, res);
  }
};

// --- 2. ONE-TIME ORDER (Razorpay) ---
export const createOrder = async (req, res) => {
  try {
    const { courseId } = req.body;
    const student = await User.findById(req.user.id);

    if (!courseId)
      return res.status(400).json({ message: "Course ID is required" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Check if student is already subscribed
    const isSubscribed = student.subscribedCourses.find(
      (sub) => sub.courseId.toString() === courseId
    );

    if (isSubscribed && isSubscribed.expiresAt > new Date()) {
      return res
        .status(400)
        .json({ message: "You are already subscribed to this course" });
    }

    const amountInPaise = Math.round(course.price * 100);
    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      courseTitle: course.title,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// --- 3. VERIFY PAYMENT (One-Time) ---
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      courseId,
    } = req.body;
    const studentId = req.user.id;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !courseId
    ) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    const student = await User.findById(studentId);
    const course = await Course.findById(courseId);

    if (!student || !course)
      return res.status(404).json({ message: "User or Course not found" });

    // Grant Access
    const now = new Date();
    const expiresAt = new Date(now);
    const durationInDays = course.durationInDays || 365;
    expiresAt.setDate(expiresAt.getDate() + parseInt(durationInDays, 10));

    student.subscribedCourses.push({
      courseId: course._id,
      subscribedAt: now,
      expiresAt: expiresAt,
    });

    await student.save();

    await Payment.create({
      student: studentId,
      course: courseId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount: course.price,
    });

    // Send Email
    try {
      const expiryDateString = expiresAt.toLocaleDateString("en-US");
      await transporter.sendMail({
        from: `"SathyaGomani Academy" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: `Payment Successful: ${course.title}`,
        html: `
          <p>Hello ${student.FirstName},</p>
          <p>Payment successful! You have access until <b>${expiryDateString}</b>.</p>
          <p>Receipt ID: ${razorpay_payment_id}</p>
        `,
      });
    } catch (emailErr) {
      console.error("Email failed:", emailErr);
    }

    res
      .status(200)
      .json({ message: "Payment successful! Course access granted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// --- 4. CREATE SUBSCRIPTION (Installments) ---
export const createSubscription = async (req, res) => {
  try {
    const { plan_id, courseId } = req.body;
    const studentId = req.user.id;

    if (!plan_id || !courseId) {
      return res
        .status(400)
        .json({ message: "plan_id and courseId are required" });
    }

    const student = await User.findById(studentId);
    const course = await Course.findById(courseId);
    if (!student || !course) {
      return res.status(404).json({ message: "Student or Course not found" });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: plan_id,
      customer_notify: 1,
      total_count: 5, // Ensure this matches your plan details
    });

    await Subscription.create({
      student: studentId,
      course: courseId,
      plan_id: plan_id,
      razorpay_subscription_id: subscription.id,
      status: subscription.status,
    });

    // Grant Initial Access (1 Month)
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 31);

    student.subscribedCourses.push({
      courseId: course._id,
      subscribedAt: now,
      expiresAt: expiresAt,
    });
    await student.save();

    res.json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// --- 5. WEBHOOK LISTENER ---
export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = body.event;
    const subscriptionId = body.payload.subscription
      ? body.payload.subscription.entity.id
      : null;

    if (!subscriptionId) return res.status(200).json({ status: "ignored" });

    const localSub = await Subscription.findOne({
      razorpay_subscription_id: subscriptionId,
    });

    if (!localSub) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const student = await User.findById(localSub.student);

    if (event === "subscription.charged") {
      // Extend access by 30 days
      const sub = student.subscribedCourses.find(
        (s) => s.courseId.toString() === localSub.course.toString()
      );

      if (sub) {
        const newExpiresAt = new Date(sub.expiresAt);
        // If expired, start from now
        if (newExpiresAt < new Date()) {
          newExpiresAt.setTime(Date.now());
        }
        newExpiresAt.setDate(newExpiresAt.getDate() + 31);
        sub.expiresAt = newExpiresAt;
        await student.save();
      }
    }

    if (event === "subscription.halted" || event === "subscription.cancelled") {
      student.subscribedCourses = student.subscribedCourses.filter(
        (s) => s.courseId.toString() !== localSub.course.toString()
      );
      await student.save();

      localSub.status = "cancelled";
      await localSub.save();
    }

    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// --- ADMIN FUNCTIONS ---

export const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({})
      .populate("student", "FirstName LastName email")
      .populate("course", "title price")
      .sort({ createdAt: -1 });

    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    try {
      await razorpay.subscriptions.cancel(
        subscription.razorpay_subscription_id
      );
    } catch (rzpError) {
      console.error("Razorpay Cancel Error:", rzpError);
    }

    subscription.status = "cancelled";
    await subscription.save();

    const student = await User.findById(subscription.student);
    if (student) {
      student.subscribedCourses = student.subscribedCourses.filter(
        (sub) => sub.courseId.toString() !== subscription.course.toString()
      );
      await student.save();
    }

    res.json({ message: "Subscription cancelled successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find({})
      .populate("student", "FirstName LastName email")
      .populate("course", "title")
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSubscriptionStatus = async (req, res) => {
  try {
    const studentId = req.user.id;
    const user = await User.findById(studentId).populate({
      path: "subscribedCourses.courseId",
      select: "title thumbnail",
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();

    const statusList = user.subscribedCourses
      .map((sub) => {
        // Handle cases where course might be deleted
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
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
