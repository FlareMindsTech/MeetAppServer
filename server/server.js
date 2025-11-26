import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors"; 
import apiRoutes from "./routes/apiRoutes.js"; 

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Allow frontend requests

//Api Routes
//all routes with /api
app.use("/api", apiRoutes); 

// error handler 
// app.use((err, req, res, next) => {
//   try {
//     console.error("=== Express Error Handler ===");
//     if (err && typeof err === "object") {
//       // Log full enumerable and non-enumerable properties
//       console.error(JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
//       if (err.stack) console.error(err.stack);
//     } else {
//       console.error(err);
//     }
//   } catch (loggingErr) {
//     console.error("Error while logging error:", loggingErr);
//   }
//   if (res.headersSent) return next(err);
//   res.status(err && err.status ? err.status : 500).json({ message: err && err.message ? err.message : "Internal Server Error" });
// });

// Connect MongoDB & Start Server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch(err => console.error("MongoDB connection error:", err));