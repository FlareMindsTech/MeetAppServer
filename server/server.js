

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

// --- HEALTH CHECK ROUTE ---
// Add this so you don't see "Cannot GET /" when clicking the main link
app.get("/", (req, res) => {
  res.send("API is running successfully!");
});

// --- API ROUTES ---
app.use("/api", apiRoutes); 

// --- DATABASE CONNECTION LOGIC (Optimized for Vercel) ---
const connectDB = async () => {
  // If already connected, reuse the connection
  if (mongoose.connection.readyState >= 1) return;

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
};

// --- START SERVER ---

// 1. If running on Vercel, export the app (Vercel handles the server)
if (process.env.VERCEL) {
    connectDB(); // Ensure DB is connected on cold start
} 
// 2. If running locally, start the server manually
else {
    connectDB().then(() => {
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server running locally on port ${PORT}`);
        });
    });
}

export default app;