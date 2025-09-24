// import cron from "node-cron";
// import Meeting from "../Model/meet.js";

// cron.schedule("* * * * *", async () => {
//   try {
//     const now = new Date();
//     const result = await Meeting.deleteMany({ deleteAt: { $lte: now } });
//     if (result.deletedCount > 0) {
//       console.log(`⏰ Auto-deleted ${result.deletedCount} meeting(s)`);
//     }
//   } catch (err) {
//     console.error("Error cleaning meetings:", err.message);
//   }
// });
import cron from "node-cron";
import Meeting from "../Model/meet.js";

// Run every minute
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date(); // current date and time

    // Delete all meetings whose deleteAt <= now
    const result = await Meeting.deleteMany({ deleteAt: { $lte: now } });

    if (result.deletedCount > 0) {
      console.log(`⏰ Auto-deleted ${result.deletedCount} meeting(s) at ${now.toLocaleString()}`);
    }
  } catch (err) {
    console.error("Error cleaning meetings:", err.message);
  }
}, {
  scheduled: true,   // ensures the cron starts automatically
  timezone: "Asia/Kolkata" // optional: set your server timezone
});
