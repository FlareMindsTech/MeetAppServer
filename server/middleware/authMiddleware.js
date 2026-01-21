import jwt from "jsonwebtoken";
import User from "../Model/userSchema.js"; // Import User model

// Auth middleware: checks JWT
export default async function auth(req, res, next) {
  const authHeader = req.header("Authorization");
  // 1Header missing
  if (!authHeader) {
    return res.status(401).json({ error: "No Authorization header provided" });
  }

  // Check format: must be "Bearer <token>"
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "Invalid Authorization header format" });
  }

  const token = parts[1];

  // Verify JWT
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123");
    
    // Check if session is valid (Single Device Logic)
    const user = await User.findById(decoded.id).select("sessionId role email");
    
    if (!user) {
       return res.status(401).json({ error: "User not found" });
    }

    if (decoded.sessionId && user.sessionId && decoded.sessionId !== user.sessionId) {
       return res.status(401).json({ error: "Session expired. You logged in on another device." });
    }

    // Determine strictness: if token has no sessionId but user has one, force logout?
    // backward compatibility: if old token (no sessionId) presented, allow or deny?
    // Let's enforce: If DB has sessionId, Token MUST match. 
    // If Token has no sessionId (old token), it will fail equality check if DB has one.
    
    req.user = decoded; // contains { id, role, email, sessionId }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Middleware: allows only students
export const studentOnly = (req, res, next) => {
  if (!req.user || req.user.role.toLowerCase() !== "student") {
    return res.status(403).json({ error: "Access denied: Students only" });
  }
  next();
};
