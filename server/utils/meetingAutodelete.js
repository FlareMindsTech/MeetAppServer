import cron from "node-cron";
import Meeting from "../Model/meet.js";

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    // Get all meetings
    const meetings = await Meeting.find();

    for (let meeting of meetings) {
      const [eh, em] = meeting.endTime.split(":").map(Number);
      const meetingEnd = new Date(meeting.date);
      meetingEnd.setHours(eh, em, 0, 0);

      // Add 1 minutes grace
      const deleteAt = new Date(meetingEnd.getTime() + 1 * 60 * 1000);

      if (now >= deleteAt) {
        await Meeting.findByIdAndDelete(meeting._id);
        console.log(`⏰ Auto-deleted meeting: ${meeting.className}`);
      }
    }
  } catch (err) {
    console.error("Error cleaning meetings:", err.message);
  }
});
