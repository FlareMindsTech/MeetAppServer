const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");

// Reuse the same transporter from your controller
const transporter = require("../controller/meetingController").transporter;

// Test email route
router.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: `"Admin" <${process.env.EMAIL_USER}>`,
      to: "rajanakash3012@gmail.com", 
      subject: "Test Email from MeetAppServer",
      html: `<p>This is a test email to verify Nodemailer setup.</p>`,
    });
    res.json({ message: "Test email sent successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
