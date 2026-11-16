import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceAccount = null;

// Try loading service account from local JSON file or environment variable
try {
  const localKeyPath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(localKeyPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, "utf-8"));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
} catch (e) {
  console.warn("⚠️ Could not load Firebase Service Account credentials:", e.message);
}

// Initialize Firebase App if not already initialized
let app = null;
let messaging = null;

try {
  if (serviceAccount) {
    app = getApps().length === 0
      ? initializeApp({ credential: cert(serviceAccount) })
      : getApps()[0];
    messaging = getMessaging(app);
    console.log("✅ Firebase Admin initialized successfully");
  } else {
    console.warn("⚠️ Firebase service account not found. Push notifications will be skipped.");
  }
} catch (err) {
  console.error("❌ Firebase Admin initialization error:", err.message);
}

/**
 * 1. Broadcast push notification to students/admins when a new course is created
 */
export const sendNewCourseNotification = async (course, { creatorId = "", creatorRole = "" } = {}) => {
  try {
    if (!messaging) {
      console.warn("⚠️ FCM Messaging not initialized, skipping notification");
      return;
    }
    const courseId = course._id ? course._id.toString() : (course.id || "");
    const courseTitle = course.title || "New Course";
    const courseThumbnail = course.thumbnail || "";

    // Target roles:
    // If Owner creates -> notify Customers/Students & Admins (exclude Owner)
    // If Admin creates -> notify Customers/Students & Owner (exclude Admin)
    let condition = "'students' in topics";
    const role = (creatorRole || "").toLowerCase().trim();
    if (role === "owner") {
      condition = "'students' in topics || 'admins' in topics";
    } else if (role === "admin") {
      condition = "'students' in topics || 'owners' in topics";
    } else {
      condition = "'all_users' in topics";
    }

    const message = {
      notification: {
        title: "🎓 New Course Available!",
        body: `"${courseTitle}" has just been published. Tap to view details!`,
      },
      data: {
        type: "new_course",
        courseId: courseId,
        title: courseTitle,
        creatorId: creatorId ? creatorId.toString() : "",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      condition: condition,
      android: {
        priority: "high",
        ttl: 0,
        notification: {
          channelId: "high_importance_channel",
          priority: "max",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
          },
        },
      },
    };

    if (courseThumbnail) {
      message.notification.imageUrl = courseThumbnail;
    }

    const response = await messaging.send(message);
    console.log("✅ FCM New Course notification sent:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending new course notification:", error.message);
  }
};

/**
 * 2. Broadcast push notification when an Announcement is published
 */
export const sendAnnouncementNotification = async (announcement, { creatorId = "", creatorRole = "" } = {}) => {
  try {
    if (!messaging) {
      console.warn("⚠️ FCM Messaging not initialized, skipping notification");
      return;
    }
    const title = announcement.title || "New Announcement";
    const body = announcement.message || "An important announcement was posted. Tap to view!";

    // Target roles:
    // If Owner creates -> notify Students & Admins
    // If Admin creates -> notify Students & Owner
    let condition = "'students' in topics";
    const role = (creatorRole || "").toLowerCase().trim();
    if (role === "owner") {
      condition = "'students' in topics || 'admins' in topics";
    } else if (role === "admin") {
      condition = "'students' in topics || 'owners' in topics";
    } else {
      condition = "'all_users' in topics";
    }

    const message = {
      notification: {
        title: `📢 ${title}`,
        body: body,
      },
      data: {
        type: "announcement",
        announcementId: announcement._id ? announcement._id.toString() : "",
        creatorId: creatorId ? creatorId.toString() : "",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      condition: condition,
      android: {
        priority: "high",
        ttl: 0,
        notification: {
          channelId: "high_importance_channel",
          priority: "max",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
          },
        },
      },
    };

    const response = await messaging.send(message);
    console.log("✅ FCM Announcement notification sent:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending announcement notification:", error.message);
  }
};

/**
 * 3. Send push notification when a new Lesson is uploaded to a course
 * ONLY sent to enrolled students who are subscribed to this course topic (course_<courseId>)
 */
export const sendNewLessonNotification = async ({ lessonTitle, courseTitle, courseId, creatorId = "", creatorRole = "" }) => {
  try {
    if (!messaging) {
      console.warn("⚠️ FCM Messaging not initialized, skipping notification");
      return;
    }

    const cId = courseId ? courseId.toString() : "";
    if (!cId) {
      console.warn("⚠️ courseId missing for lesson notification, skipping");
      return;
    }

    // Direct topic: only students enrolled in this course receive this notification
    const topic = `course_${cId}`;

    const message = {
      notification: {
        title: `📚 New Lesson in ${courseTitle || "Course"}!`,
        body: `New lesson "${lessonTitle}" has been added. Tap to watch!`,
      },
      data: {
        type: "new_lesson",
        courseId: cId,
        title: lessonTitle || "",
        creatorId: creatorId ? creatorId.toString() : "",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      topic: topic,
      android: {
        priority: "high",
        ttl: 0,
        notification: {
          channelId: "high_importance_channel",
          priority: "max",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
          },
        },
      },
    };

    const response = await messaging.send(message);
    console.log(`✅ FCM New Lesson notification sent to topic [${topic}]:`, response);
    return response;
  } catch (error) {
    console.error("❌ Error sending new lesson notification:", error.message);
  }
};

/**
 * 4. Send morning marketing notification to all students
 */
export const sendMarketingNotification = async ({ title, body }) => {
  try {
    if (!messaging) {
      console.warn("⚠️ FCM Messaging not initialized, skipping notification");
      return;
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        type: "explore_courses",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      topic: "students",
      android: {
        priority: "high",
        ttl: 0,
        notification: {
          channelId: "high_importance_channel",
          priority: "max",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
          },
        },
      },
    };

    const response = await messaging.send(message);
    console.log("✅ FCM 6:00 AM Marketing notification sent:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending marketing notification:", error.message);
  }
};

export { app, messaging };
