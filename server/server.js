

// import express from "express";
// import mongoose from "mongoose";
// import dotenv from "dotenv";
// import path from "path";
// import { fileURLToPath } from "url";
// import cors from "cors"; 


// import apiRoutes from "./routes/apiRoutes.js"; 

// dotenv.config();
// const app = express();

// // Middleware
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cors()); // Allow frontend requests

// // Static Files Setup
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// const uploadPath = path.join(__dirname, "..", "uploads");

// console.log("Serving static files from:", uploadPath); 

// // Serve the folder at the "/uploads" URL
// app.use("/uploads", express.static(uploadPath));

// // API Routes
// app.use("/api", apiRoutes); 

// // Connect DB & Start
// mongoose.connect(process.env.MONGO_URI)
//   .then(() => {
//     console.log("MongoDB connected");
//     app.listen(process.env.PORT || 5000, () => {
//       console.log(`Server running on port ${process.env.PORT || 5000}`);
//     });
//   })
//   .catch(err => console.error("MongoDB connection error:", err));



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

// --- API ROUTES ---
// This prefixes all routes with /api
app.use("/api", apiRoutes); 

// Generic error handler (must be after all routes)
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