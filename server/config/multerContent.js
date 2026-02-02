import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    try {
      let folderName = "academy_files";
      let resourceType = "auto"; 

      const mime = file.mimetype.toLowerCase();
      const filename = file.originalname.toLowerCase();

      if (mime.startsWith("video")) {
        folderName = "academy_videos";
        resourceType = "video";
      } else if (mime.includes("pdf") || filename.endsWith(".pdf")) {
        folderName = "academy_pdfs";
        resourceType = "raw"; 
      }

      const safeName = file.originalname
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .toLowerCase();
        
      let public_id = `${Date.now()}-${safeName}`;
      
  
      if (resourceType === "raw" && (mime.includes("pdf") || filename.endsWith(".pdf"))) {
        public_id += ".pdf";
      }

      return {
        folder: folderName,
        resource_type: resourceType,
        public_id: public_id,
        access_mode: 'public', 
      };
    } catch (error) {
      console.error("Error in Multer Params:", error);
      throw error;
    }
  },
});

export const uploadContent = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, 
});