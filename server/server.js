import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors"; 
import apiRoutes from "./routes/apiRoutes.js"; 

dotenv.config();
const app = express();

// --- 1. MIDDLEWARE ---

// Capture the raw body for Razorpay Webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true }));
app.use(cors()); 

// --- 2. DATABASE CONNECTION LOGIC (Cached Pattern) ---
// This pattern prevents creating multiple connections on Vercel reloads
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // If we have a connection, return it
  if (cached.conn) {
    return cached.conn;
  }

  // If no connection promise exists, create a new one
  if (!cached.promise) {
    const opts = {
      bufferCommands: false, //Stop buffering to prevent timeouts
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, opts).then((mongoose) => {
      console.log("MongoDB Connected");
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

// --- 3. CONNECTION MIDDLEWARE ---
// This ensures DB is connected BEFORE any route is accessed
app.use(async (req, res, next) => {
  // Skip DB connection for the health check route to verify server is up
  if (req.path === '/') {
    return next();
  }
  
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

// --- 4. ROUTES ---
app.get("/", (req, res) => {
  res.send("API is running successfully!");
});

app.use("/api", apiRoutes); 

// --- 5. START SERVER ---

// Only listen if running locally (Vercel exports the app automatically)
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}

export default app;