import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

// Load env vars
dotenv.config(); 

// Debug: Check if keys are loaded (Remove this line after testing)
console.log("Cloudinary Config Check:", process.env.CLOUDINARY_CLOUD_NAME ? "Loaded" : "MISSING");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;  