

import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folderName = "academy_files";
    let resourceType = "auto"; // Default

    if (file.mimetype.startsWith("video")) {
      folderName = "academy_videos";
      resourceType = "video";
    } else if (file.mimetype.includes("pdf")) {
      folderName = "academy_pdfs";
      resourceType = "raw"; //Treat PDFs as 'raw' files
    }

    return {
      folder: folderName,
      resource_type: resourceType,
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`,
    };
  },
});

export const uploadContent = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});