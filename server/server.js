import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors"; 
import apiRoutes from "./routes/apiRoutes.js"; 

dotenv.config();
const app = express();

// --- GLOBAL CONFIG: STOP BUFFERING ---

mongoose.set("strictQuery", false);
mongoose.set("bufferCommands", false); 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); 

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

// --- CONNECTION MIDDLEWARE ---
app.use(async (req, res, next) => {
  
  if (req.path === "/") return next();

  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database Connection Failed:", error);
   
    res.status(500).json({ error: "Database Connection Failed", details: error.message });
  }
});

app.get("/", (req, res) => res.send("API is running successfully!"));
app.use("/api", apiRoutes); 

// --- START SERVER ---
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running locally on port ${PORT}`);
    });
}

export default app;