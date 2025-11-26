import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); // Load .env

// const transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 587,
//   secure: false,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS, // App Password
//   },
//   logger: true,
//   debug: true,
// });

// // Verify connection
// transporter.verify()
//   .then(() => console.log("Mail server ready"))
//   .catch((err) => console.error("Mail server verify failed:", err));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default transporter; // ES module default export
