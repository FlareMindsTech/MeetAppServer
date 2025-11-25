import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const uploadDir = path.join(__dirname, "..", "uploads", "thumbnails");
fs.mkdirSync(uploadDir, { recursive: true });


const storage = multer.diskStorage({
destination: (req, file, cb) => {
cb(null, uploadDir);
},
filename: (req, file, cb) => {
const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
cb(null, `${Date.now()}_${safe}`);
},
});


const fileFilter = (req, file, cb) => {
if (/^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype)) return cb(null, true);
cb(new Error("Only image files are allowed for thumbnail"));
};


export const upload = multer({
storage,
fileFilter,
limits: { fileSize: 5 * 1024 * 1024 }, // 5 mb limit 
});