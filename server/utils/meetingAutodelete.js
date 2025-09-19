import cron from "node-cron";
import Meeting from "../Model/meet.js";

// Run every minute
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const result = await Meeting.deleteMany({ deleteAt: { $lte: now } });
    if (result.deletedCount > 0) {
      console.log(`⏰ Auto-deleted ${result.deletedCount} meeting(s)`);
    }
  } catch (err) {
    console.error("Error cleaning meetings:", err.message);
  }
});
