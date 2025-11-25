

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors"; 


import apiRoutes from "./routes/apiRoutes.js"; 

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Allow frontend requests

// Static Files Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const uploadPath = path.join(__dirname, "..", "uploads");

console.log("Serving static files from:", uploadPath); 

// Serve the folder at the "/uploads" URL
app.use("/uploads", express.static(uploadPath));

// API Routes
app.use("/api", apiRoutes); 

// Connect DB & Start
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch(err => console.error("MongoDB connection error:", err));