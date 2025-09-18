const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // App Password
  },
  logger: true,
  debug: true,
});

transporter.verify().then(() => console.log("Mail server ready")).catch(console.error);

module.exports = transporter;
