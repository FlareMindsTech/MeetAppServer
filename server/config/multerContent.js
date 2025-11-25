


import multer from "multer";
import path from "path";
import fs from "fs";

// Define allowed extensions
const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|mkv|pdf/;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Auto-detect folder based on mimetype
    let uploadDir = "files"; // Default

    if (file.mimetype.startsWith("video/")) {
      uploadDir = "videos";
    } else if (file.mimetype === "application/pdf") {
      uploadDir = "pdfs";
    } else if (file.mimetype.startsWith("image/")) {
      uploadDir = "thumbnails"; // or "images"
    }

    const fullUploadPath = path.join("uploads", uploadDir);

    // Create directory if it doesn't exist
    if (!fs.existsSync(fullUploadPath)) {
      fs.mkdirSync(fullUploadPath, { recursive: true });
    }

    cb(null, fullUploadPath);
  },

  filename: (req, file, cb) => {
    // Use timestamp + original name to avoid conflicts
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error("Error: File type not supported!"), false);
  }
};

export const uploadContent = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: fileFilter,
});