import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folderName = "academy_files";
    let resource_type = "auto";
    const mime = file.mimetype.toLowerCase();

    if (mime.startsWith("video")) {
      folderName = "academy_videos";
      resource_type = "video";
    } else if (mime.includes("pdf")) {
      folderName = "academy_pdfs";
      resource_type = "raw"; // Cloudinary uses 'raw' for PDFs or non-media
    }

    return {
      folder: folderName,
      resource_type: resource_type,
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9.\-_]/g, "_")}`
    };
  },
});

export const uploadContent = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    // If the file is a video, silently discard it so it doesn't get uploaded to Cloudinary
    if (file.mimetype.toLowerCase().startsWith("video/")) {
      return cb(null, false);
    }
    // Otherwise, allow the file upload to proceed (e.g. PDFs, images)
    cb(null, true);
  },
});
