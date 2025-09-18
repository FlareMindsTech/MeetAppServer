require("dotenv").config(); // load .env
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // your Gmail App Password
  },
  logger: true,
  debug: true,
});

transporter.sendMail(
  {
    from: process.env.EMAIL_USER,
    to: "rajanakash3012@gmail.com", // replace with your email to test
    subject: "Test Email",
    text: "This is a test email from your Node.js app.",
  },
  (err, info) => {
    if (err) console.log("Error:", err);
    else console.log("Email sent:", info.response);
  }
);
