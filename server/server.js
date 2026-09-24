import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors"; 
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";

// import apiRoutes from "./routes/apiRoutes.js"; 
 import authRoutes from "./routes/authRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import featureRoutes from "./routes/featureRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import { initEmailAutomation } from "./utils/emailService.js";
import { privacyPolicyHTML } from "./utils/privacyPolicyHTML.js";

dotenv.config();

// --- AUTOMATED SERVICES ---
initEmailAutomation();

const app = express();

// --- GLOBAL CONFIG: STOP BUFFERING ---

mongoose.set("strictQuery", false);
mongoose.set("bufferCommands", false); 

app.use(express.json({
  limit: "100mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(helmet());
app.use(compression());
app.use(cors({
  exposedHeaders: ["X-Total-Count", "X-Total-Pages"]
}));

// --- RATE LIMITING ---
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased to 1000 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skip: (req) => {
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.decode(token);
        if (decoded && (decoded.role === "owner" || decoded.role === "admin")) {
          return true; // Completely bypass rate limit
        }
      } catch (e) {
        return false;
      }
    }
    return false;
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window per IP for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again after 15 minutes." }
});

app.use("/api", generalLimiter);

// --- CACHED CONNECTION LOGIC ---
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const opts = {
      bufferCommands: false, 
      serverSelectionTimeoutMS: 5000, 
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, opts).then(async (mongoose) => {
      console.log("MongoDB Connected");
      
      // Temporary: Drop old email index to fix the duplicate null error
      try {
        await mongoose.connection.db.collection('users').dropIndex('email_1');
        console.log("Cleaned up old email index");
      } catch (e) {
        // Index might not exist or already be dropped
      }
      
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
};

// --- PERFORMANCE LOGGER ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (!req.originalUrl.includes("favicon")) {
        console.log(`[PERF] ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
  });
  next();
});

// --- CONNECTION MIDDLEWARE ---

app.use(async (req, res, next) => {
  
  if (req.path === "/" || req.path === "/privacy-policy") return next();

  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database Connection Failed:", error);
   
    res.status(500).json({ error: "Database Connection Failed", details: error.message });
  }
});

app.get("/", (req, res) => res.send("API is running successfully!"));
app.get("/privacy-policy", (req, res) => {
  res.type('html').send(privacyPolicyHTML);
});
// app.use("/api", apiRoutes); 

// --- STRICT AUTH RATE LIMITERS ---
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/request-otp", authLimiter);
app.use("/api/auth/verify-otp", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use("/api", authRoutes);

app.use("/api", courseRoutes);
app.use("/api", userRoutes);
app.use("/api", paymentRoutes);
app.use("/api", quizRoutes);
app.use("/api", featureRoutes);
app.use("/api", chatRoutes);
app.use("/api/meetings", meetingRoutes);

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error("GLOBAL SERVER CRASH:", err);
  res.status(500).json({ 
    message: "Server Crash: " + (err.message || err.toString()), 
    stack: process.env.VERCEL ? undefined : err.stack 
  });
});

// --- START SERVER ---
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}

export default app;