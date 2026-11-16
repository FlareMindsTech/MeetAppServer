import cron from "node-cron";
import { sendMarketingNotification } from "../config/firebase.js";

const marketingMessages = [
  {
    title: "💼 Want to Start Your Own Boutique?",
    body: "Master measurement drafting, precise cutting & professional stitching with Aadvi Fashion Institute! 🪡✨",
  },
  {
    title: "✂️ Master Perfect Necklines & Sleeve Patterns!",
    body: "Discover secret finishing techniques used by top designer boutiques. Tap to view courses & join today! 💃",
  },
  {
    title: "🏆 Become a Certified Designer from Home!",
    body: "Step-by-step video lessons taught by expert fashion instructors. Learn at your own pace anytime! 📱",
  },
  {
    title: "☀️ Good Morning! Start Your Fashion Journey Today",
    body: "Upgrade your stitching & tailoring skills before your day starts. Explore popular courses & enroll now! 👗✂️",
  },
  {
    title: "🧵 Turn Your Passion into Beautiful Outfits!",
    body: "Learn professional designer blouse & dress making from home. Tap to explore classes! 🌟",
  },
  {
    title: "👗 Design Your Own Dresses with Confidence!",
    body: "From basic cutting to advanced designer patterns, learn it all step-by-step. Tap to start learning now! ✨",
  },
  {
    title: "🔔 New Batches Open for Enrollment!",
    body: "Popular fashion design and tailoring masterclasses are filling up. Tap to explore & reserve your spot! 🏃‍♀️💨",
  },
];

let currentIndex = 0;

export const dispatchMorningMarketingNotification = async () => {
  const msg = marketingMessages[currentIndex % marketingMessages.length];
  currentIndex++;
  console.log(`[Marketing Cron] Dispatching 6:00 AM notification: "${msg.title}"`);
  return await sendMarketingNotification(msg);
};

// Initializes node-cron: runs at 6:00 AM IST (00:30 UTC) every 2 days
export const initMarketingAutomation = () => {
  // Cron schedule: '30 0 */2 * *' -> 00:30 UTC = 6:00 AM IST, every 2 days
  cron.schedule("30 0 */2 * *", async () => {
    try {
      await dispatchMorningMarketingNotification();
    } catch (err) {
      console.error("[Marketing Cron] Error during scheduled dispatch:", err.message);
    }
  });
  console.log("✅ [Marketing Automation] Scheduled for 6:00 AM IST every 2 days.");
};
