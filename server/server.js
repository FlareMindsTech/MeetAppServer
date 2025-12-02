

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors"; 
import apiRoutes from "./routes/apiRoutes.js"; 

dotenv.config();
const app = express();

// --- MIDDLEWARE ---

// Capture the raw body for signature verification
// This must be defined BEFORE any routes are mounted.
app.use(express.json({
  verify: (req, res, buf) => {
    // Store the raw buffer in req.rawBody so the webhook controller can verify the signature
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Allow frontend requests

// --- API ROUTES ---
// This prefixes all routes with /api
// Ensure your paymentRoutes (inside apiRoutes) has the POST /payment/webhook endpoint defined.
app.use("/api", apiRoutes); 

// Connect MongoDB & Start Server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch(err => console.error("MongoDB connection error:", err));