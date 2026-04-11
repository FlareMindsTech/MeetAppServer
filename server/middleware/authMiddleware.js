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
       console.warn(`[AUTH] Session mismatch for ${user.email || user._id}. Token: ${decoded.sessionId}, DB: ${user.sessionId}`);
       return res.status(401).json({ error: "Session expired. You logged in on another device." });
    }
    
    // Fallback: If token has no sessionId but DB does, we allow it for now
    // until we're sure all users have updated their tokens.
    
    req.user = decoded; 
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Middleware: Optional auth (attaches user if token exists, doesn't block if missing)
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123");
    const user = await User.findById(decoded.id).select("sessionId role email");
    if (user && (!decoded.sessionId || !user.sessionId || decoded.sessionId === user.sessionId)) {
      req.user = decoded;
    }
  } catch (err) {
    // Ignore error, proceed as guest
  }
  next();
};

// Middleware: allows only students
export const studentOnly = (req, res, next) => {
  if (!req.user || req.user.role.toLowerCase() !== "student") {
    return res.status(403).json({ error: "Access denied: Students only" });
  }
  next();
};
