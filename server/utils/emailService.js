import nodemailer from "nodemailer";
import cron from "node-cron";
import dotenv from "dotenv";
import User from "../Model/userSchema.js";

dotenv.config();

// --- TRANSPORTER CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const SENDER_NAME = "Aadvi Fashion Institution";
const FROM_EMAIL = process.env.EMAIL_USER;

/**
 * Common Email Wrapper to ensure consistent branding and error handling
 */
const sendMail = async ({ to, subject, html }) => {
    try {
        const info = await transporter.sendMail({
            from: `"${SENDER_NAME}" <${FROM_EMAIL}>`,
            to,
            subject,
            html
        });
        console.log(`[Email Service] Email sent: ${subject} to ${to}`);
        return info;
    } catch (error) {
        console.error(`[Email Service] Failed to send email to ${to}:`, error.message);
        throw error;
    }
};

/**
 * 1. Password Reset Email
 */
export const sendPasswordResetEmail = async (user, resetToken) => {
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, "");
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h3 style="color: #4f46e5;">Password Reset - ${SENDER_NAME}</h3>
            <p>Hello ${user.FirstName || ''},</p>
            <p>We received a request to reset your password. Click the link below to set a new one:</p>
            <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 15px 0;">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you did not request this, please ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">&copy; ${new Date().getFullYear()} ${SENDER_NAME}</p>
        </div>
    `;
    return sendMail({ to: user.email, subject: "Password Reset Request", html });
};

/**
 * 2. Enrollment Confirmation Email (Free or One-time)
 */
export const sendEnrollmentEmail = async ({ student, course, expiresAt, isOneTime = false }) => {
    let expiryDate = "Lifetime Access";
    const expDate = expiresAt ? new Date(expiresAt) : null;
    if (expDate && expDate.getFullYear() < 9990) {
        expiryDate = expDate.toLocaleDateString("en-US");
    }
    const subject = isOneTime ? "Payment Successful & Enrollment Confirmed" : "Enrollment Confirmed";
    
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #10b981;">Welcome to ${SENDER_NAME}!</h2>
            <p>Hello ${student.FirstName || student.email},</p>
            <p>You have been enrolled in the course: <b>${course.title}</b>.</p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><b>Access Valid Until:</b> ${expiryDate}</p>
            </div>
            <p>You can now log in to the portal to access your lessons and materials.</p>
            <br>
            <p>Best Regards,<br><b>${SENDER_NAME} Team</b></p>
        </div>
    `;
    return sendMail({ to: student.email, subject: `${course.title} - ${subject}`, html });
};

/**
 * 3. EMI Payment & Renewal Extension Notification
 */
export const sendPaymentExtensionEmail = async ({ student, course, paidCount, totalCount, expiresAt, isRecurring = false }) => {
    const expiryDate = new Date(expiresAt).toLocaleDateString("en-US");
    const subject = isRecurring ? "Subscription Renewed" : "EMI Payment Received";
    const message = isRecurring ? "Your monthly subscription has been renewed." : "Your EMI payment has been received and recorded.";
    
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #10b981;">Payment Received</h2>
            <p>Hello ${student.FirstName || student.email},</p>
            <p>${message}</p>
            <p><b>Course:</b> ${course.title}</p>
            <div style="background: #f4fdfa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><b>Status:</b> Access Extended ✅</p>
                <p style="margin: 5px 0;"><b>New Expiry Date:</b> ${expiryDate}</p>
                ${totalCount ? `<p style="margin: 5px 0;"><b>Installment:</b> ${paidCount} of ${totalCount}</p>` : ''}
            </div>
            <p>Keep up the great progress in your learning!</p>
            <br>
            <p>Regards,<br>${SENDER_NAME}</p>
        </div>
    `;
    return sendMail({ to: student.email, subject: `${course.title} - ${subject}`, html });
};

/**
 * 4. Meeting Invite / Allocation
 */
export const sendMeetingInvite = async ({ student, meeting, dummyLink, isFirstMeeting = false }) => {
    const subject = isFirstMeeting ? `Meeting Invitation: ${meeting.className}` : `New Meeting Allocated: ${meeting.className}`;
    
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h3 style="color: #4f46e5;">Live Class Invite</h3>
            <p>Hello <b>${student.FirstName || ''}</b>,</p>
            <p>You have been allocated to the following live session for <b>${SENDER_NAME}</b>:</p>
            <ul style="list-style: none; padding: 0;">
                <li style="padding: 5px 0;">📅 <b>Class:</b> ${meeting.className}</li>
                <li style="padding: 5px 0;">🗓️ <b>Date:</b> ${new Date(meeting.date).toDateString()}</li>
                <li style="padding: 5px 0;">🕒 <b>Time:</b> ${meeting.startTime} - ${meeting.endTime}</li>
                <li style="padding: 5px 0;">⏳ <b>Duration:</b> ${meeting.duration} minutes</li>
                ${dummyLink ? `<li style="padding: 5px 0;">🔗 <b>Link:</b> <a href="${dummyLink}">${dummyLink}</a></li>` : ''}
                ${isFirstMeeting && student.rawPassword ? `<li style="padding: 5px 0; color: #e53935;">🔑 <b>Your Password:</b> ${student.rawPassword}</li>` : ''}
            </ul>
            ${isFirstMeeting ? '<p>Please use the password above to log in to your account.</p>' : '<p>You can view more details in your dashboard class list.</p>'}
            <br>
            <p>See you there!<br>${SENDER_NAME}</p>
        </div>
    `;
    return sendMail({ to: student.email, subject, html });
};

/**
 * 4.1 Meeting Removed Notification
 */
export const sendMeetingRemovedEmail = async ({ student, meeting }) => {
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h3 style="color: #e53935;">Class Allocation Removed</h3>
            <p>Hello <b>${student.FirstName || ''}</b>,</p>
            <p>You have been removed from the session: <b>${meeting.className}</b> scheduled for ${new Date(meeting.date).toDateString()}.</p>
            <p>If this was unexpected, please contact your instructor.</p>
            <br>
            <br>
            <p>Regards,<br>${SENDER_NAME}</p>
        </div>
    `;
    return sendMail({ to: student.email, subject: `Removed from Meeting: ${meeting.className}`, html });
};

/**
 * 4.2 Meeting Rescheduled Notification
 */
export const sendMeetingRescheduledEmail = async ({ student, meeting }) => {
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h3 style="color: #f59e0b;">Class Rescheduled</h3>
            <p>Hello <b>${student.FirstName || ''}</b>,</p>
            <p>The following meeting has been rescheduled:</p>
            <ul style="list-style: none; padding: 0;">
                <li style="padding: 5px 0;">📅 <b>Class:</b> ${meeting.className}</li>
                <li style="padding: 5px 0;">🗓️ <b>New Date:</b> ${new Date(meeting.date).toDateString()}</li>
                <li style="padding: 5px 0;">🕒 <b>New Time:</b> ${meeting.startTime} - ${meeting.endTime}</li>
            </ul>
            <p>Please update your calendar. See you in the session!</p>
            <br>
            <p>Best Regards,<br>${SENDER_NAME}</p>
        </div>
    `;
    return sendMail({ to: student.email, subject: `Rescheduled: ${meeting.className}`, html });
};

/**
 * 4.3 Meeting Cancelled Notification
 */
export const sendMeetingCancelledEmail = async ({ student, meeting }) => {
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h3 style="color: #e53935;">Class Cancelled</h3>
            <p>Hello <b>${student.FirstName || ''}</b>,</p>
            <p>The meeting <b>${meeting.className}</b> scheduled for ${new Date(meeting.date).toDateString()} has been **cancelled**.</p>
            <p>We apologize for any inconvenience caused.</p>
            <br>
            <p>Regards,<br>${SENDER_NAME}</p>
        </div>
    `;
    return sendMail({ to: student.email, subject: `Meeting Cancelled: ${meeting.className}`, html });
};

/**
 * 5. Expiry Notice (Used by Cron Job)
 */
export const sendExpiryNotice = async ({ user, courseTitle, days, expiresAt }) => {
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #e53935; text-align: center;">Subscription Expiry Notice</h2>
            <p>Hello ${user.FirstName || "Student"},</p>
            <p>This is a reminder from <b>${SENDER_NAME}</b> that your access to <b>${courseTitle}</b> is scheduled to expire in <b>${days} day(s)</b> (on ${new Date(expiresAt).toLocaleDateString()}).</p>
            <div style="background: #fff8f8; padding: 15px; border-left: 4px solid #e53935; margin: 20px 0;">
                <p style="margin: 0;"><b>Action Required:</b> To maintain uninterrupted access, please ensure your next payment is processed or renew your subscription through the dashboard.</p>
            </div>
            <p>Happy Learning!</p>
            <br>
            <p>Regards,<br><b>${SENDER_NAME} Team</b></p>
        </div>
    `;
    return sendMail({ to: user.email, subject: `Reminder: Your access to ${courseTitle} is expiring soon`, html });
};

/**
 * 6. Generic/Notification Email
 */
export const sendGenericNotification = async ({ to, subject, title, message }) => {
    const html = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #10b981; border-radius: 10px;">
            <h3 style="color: #10b981;">${title}</h3>
            <p>${message}</p>
            <br>
            <p>Best Regards,<br>${SENDER_NAME}</p>
        </div>
    `;
    return sendMail({ to, subject, html });
};

/**
 * 7. Automated Email Service: Daily Expiry Checks
 * This initializes the cron job that runs in the background.
 */
export const initEmailAutomation = () => {
    // Run every day at 10:00 AM
    cron.schedule("0 10 * * *", async () => {
        console.log("[CRON] Running daily expiry notification checks...");
        try {
            const notifyDays = [3, 1]; // Notice 3 days and 1 day before
            
            for (const days of notifyDays) {
                const targetDateStart = new Date();
                targetDateStart.setHours(0, 0, 0, 0);
                targetDateStart.setDate(targetDateStart.getDate() + days);
                
                const targetDateEnd = new Date(targetDateStart);
                targetDateEnd.setHours(23, 59, 59, 999);

                // Find users with courses expiring on the target date
                const users = await User.find({
                    "subscribedCourses": {
                        $elemMatch: {
                            expiresAt: { $gte: targetDateStart, $lte: targetDateEnd }
                        }
                    }
                }).populate("subscribedCourses.courseId", "title");

                for (const user of users) {
                    const expiringCourses = Array.isArray(user.subscribedCourses) ? user.subscribedCourses.filter(sub => 
                        sub.expiresAt >= targetDateStart && sub.expiresAt <= targetDateEnd && sub.courseId
                    ) : [];

                    for (const sub of expiringCourses) {
                        try {
                            await sendExpiryNotice({
                                user,
                                courseTitle: sub.courseId.title,
                                days,
                                expiresAt: sub.expiresAt
                            });
                            console.log(`[CRON] ${days}-day notice sent to ${user.email} for ${sub.courseId.title}`);
                        } catch (err) {
                            console.error(`[CRON] Fail for ${user.email}:`, err.message);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[CRON] Global Automation Error:", err);
        }
    });
    console.log("[Email Automation] Background service initialized successfully.");
};
