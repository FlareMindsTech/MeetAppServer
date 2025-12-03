// import dotenv from "dotenv";
// import nodemailer from "nodemailer";

// dotenv.config(); // load .env from project root

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS, // your Gmail App Password
//   },
//   logger: true,
//   debug: true,
// });

// try {
//   const info = await transporter.sendMail({
//     from: process.env.EMAIL_USER,
//     to: "rajanakash3012@gmail.com", // replace with your email to test
//     subject: "Test Email",
//     text: "This is a test email from your Node.js app.",
//   });

//   console.log("Email sent:", info.response || info);
// } catch (err) {
//   console.error("Error sending test email:", err);
//   process.exit(1);
// }

import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();


const sendTestEmail = async () => {
  try {
    
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", 
      port: 465,              
      secure: true,           
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, 
      },
    });

    console.log("Attempting to send email...");

    const info = await transporter.sendMail({
      from: `"MeetApp Admin" <${process.env.EMAIL_USER}>`, // Better sender format
      to: "rajanakash3012@gmail.com",
      subject: "Test Email from Vercel",
      text: "This is a test email from your Node.js app successfully running on Vercel.",
    });

    console.log(" Email sent successfully:", info.messageId);

  } catch (err) {
    console.error(" Error sending email:", err);
    
  }
};


sendTestEmail();