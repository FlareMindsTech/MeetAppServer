import  Meeting from "../Model/meet.js";
import User from "../Model/userSchema.js";
import transporter from "./transporter.js";

// Helper to calculate duration
function calculateDuration(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return end > start ? end - start : 0;
}

// ---------------------------
// Create Meeting
// ---------------------------
export const createMeeting = async (req, res) => {
  try {
    if (!["admin", "owner"].includes(req.user.role))
      return res.status(403).json({ error: "Not authorized" });

    const { className, date, startTime, endTime } = req.body;

    const meeting = new Meeting({
      className,
      date,
      startTime,
      endTime,
      duration: calculateDuration(startTime, endTime),
      students: [] // ensure default empty array
    });

    await meeting.save();
    res.json({ message: "Meeting created successfully", meeting });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// Allocate Students
// ---------------------------
export const allocateStudents = async (req, res) => {
  try {
    if (!["admin", "owner"].includes(req.user.role))
      return res.status(403).json({ error: "Not authorized" });

    const { studentIds } = req.body;
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    meeting.students = meeting.students || [];

    const students = await User.find({ _id: { $in: studentIds }, role: "student" });
    if (!students.length) return res.status(400).json({ error: "No valid students" });

    const emailResults = [];

    for (let student of students) {
      const alreadyAdded = meeting.students.find(
        (s) => s.studentId.toString() === student._id.toString()
      );

      if (!alreadyAdded) {
        meeting.students.push({ studentId: student._id });

        // Send email including raw password
        const mailOptions = {
          from: `"Admin" <${process.env.EMAIL_USER}>`,
          to: student.email,
          subject: `Invitation: ${meeting.className}`,
          html: `
            <p>Hello <b>${student.FirstName}</b>,</p>
            <p>You are invited to:</p>
            <ul>
              <li><b>Class:</b> ${meeting.className}</li>
              <li><b>Date:</b> ${meeting.date.toDateString()}</li>
              <li><b>Time:</b> ${meeting.startTime} - ${meeting.endTime}</li>
              <li><b>Password:</b> ${student.rawPassword}</li>
            </ul>
            <p>Regards,<br>Admin</p>
          `,
        };

        try {
          await transporter.sendMail(mailOptions);
          emailResults.push({ student: student.email, status: "Sent" });
        } catch (err) {
          emailResults.push({ student: student.email, status: "Failed", error: err.message });
        }
      } else {
        emailResults.push({ student: student.email, status: "Already allocated" });
      }
    }

    await meeting.save();
    res.json({ message: "Students processed", emailResults, meeting });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// Remove Students
// ---------------------------
export const removeStudents = async (req, res) => {
  try {
    if (!["admin", "owner"].includes(req.user.role))
      return res.status(403).json({ error: "Not authorized" });

    const { studentIds } = req.body;
    let meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    meeting.students = meeting.students || [];

    const removedStudents = meeting.students.filter((s) =>
      studentIds.includes(s.studentId.toString())
    );

    meeting.students = meeting.students.filter(
      (s) => !studentIds.includes(s.studentId.toString())
    );

    await meeting.save();

    const students = await User.find({
      _id: { $in: removedStudents.map((s) => s.studentId) },
      role: "student",
    });

    const emailResults = [];
    for (let student of students) {
      try {
        await transporter.sendMail({
          from: `"Admin" <${process.env.EMAIL_USER}>`,
          to: student.email,
          subject: `Removed from Meeting: ${meeting.className}`,
          html: `
            <p>Hello <b>${student.FirstName}</b>,</p>
            <p>You have been removed from:</p>
            <ul>
              <li><b>Class:</b> ${meeting.className}</li>
              <li><b>Date:</b> ${meeting.date.toDateString()}</li>
              <li><b>Time:</b> ${meeting.startTime} - ${meeting.endTime}</li>
              <li><b>Password:</b> ${student.rawPassword}</li>
            </ul>
            <p>Regards,<br>Admin</p>
          `,
        });
        emailResults.push({ student: student.email, status: "Sent" });
      } catch (err) {
        emailResults.push({ student: student.email, status: "Failed", error: err.message });
      }
    }

    meeting = await Meeting.findById(meeting._id).populate("students.studentId");
    res.json({ message: "Students removed", meeting, emailResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// Reschedule Meeting
// ---------------------------
export const rescheduleMeeting = async (req, res) => {
  try {
    if (!["admin", "owner"].includes(req.user.role))
      return res.status(403).json({ error: "Not authorized" });

    const { date, startTime, endTime } = req.body;
    let meeting = await Meeting.findById(req.params.id).populate("students.studentId");
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    if (date) meeting.date = date;
    if (startTime) meeting.startTime = startTime;
    if (endTime) meeting.endTime = endTime;
    if (meeting.startTime && meeting.endTime)
      meeting.duration = calculateDuration(meeting.startTime, meeting.endTime);

    await meeting.save();

    const emailResults = [];
    for (let sObj of meeting.students) {
      const student = sObj.studentId;
      try {
        await transporter.sendMail({
          from: `"Admin" <${process.env.EMAIL_USER}>`,
          to: student.email,
          subject: `Rescheduled: ${meeting.className}`,
          html: `
            <p>Hello <b>${student.FirstName}</b>,</p>
            <p>The meeting has been rescheduled:</p>
            <ul>
              <li><b>Class:</b> ${meeting.className}</li>
              <li><b>Date:</b> ${meeting.date.toDateString()}</li>
              <li><b>Time:</b> ${meeting.startTime} - ${meeting.endTime}</li>
              <li><b>Duration:</b> ${meeting.duration} minutes</li>
            </ul>
            <p>Please update your calendar.<br>Regards,<br>Admin</p>
          `,
        });
        emailResults.push({ student: student.email, status: "Sent" });
      } catch (err) {
        emailResults.push({ student: student.email, status: "Failed", error: err.message });
      }
    }

    res.json({ message: "Meeting rescheduled", meeting, emailResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// Delete Meeting
// ---------------------------
export const deleteMeeting = async (req, res) => {
  try {
    if (!["admin", "owner"].includes(req.user.role))
      return res.status(403).json({ error: "Not authorized" });

    const meeting = await Meeting.findById(req.params.id).populate("students.studentId");
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    const emailResults = [];
    for (let sObj of meeting.students) {
      const student = sObj.studentId;
      try {
        await transporter.sendMail({
          from: `"Admin" <${process.env.EMAIL_USER}>`,
          to: student.email,
          subject: `Meeting Cancelled: ${meeting.className}`,
          html: `
            <p>Hello <b>${student.FirstName}</b>,</p>
            <p>The meeting has been cancelled:</p>
            <ul>
              <li><b>Class:</b> ${meeting.className}</li>
              <li><b>Date:</b> ${meeting.date.toDateString()}</li>
              <li><b>Time:</b> ${meeting.startTime} - ${meeting.endTime}</li>
            </ul>
            <p>Regards,<br>Admin</p>
          `,
        });
        emailResults.push({ student: student.email, status: "Sent" });
      } catch (err) {
        emailResults.push({ student: student.email, status: "Failed", error: err.message });
      }
    }

    await Meeting.findByIdAndDelete(req.params.id);
    res.json({ message: "Meeting deleted", emailResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
