import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const uploadDir = path.join(__dirname, "..", "uploads", "videos");
fs.mkdirSync(uploadDir, { recursive: true });


const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, uploadDir),
filename: (req, file, cb) => {
const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
cb(null, `${Date.now()}_${safe}`);
},
});


const fileFilter = (req, file, cb) => {
// accept common video formats
if (/^video\/(mp4|quicktime|x-matroska|webm|x-msvideo)$/i.test(file.mimetype)) return cb(null, true);
// also allow some common extensions when some environments send octet-stream
const ext = path.extname(file.originalname).toLowerCase();
if ([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"].includes(ext)) return cb(null, true);
return cb(new Error("Only video files are allowed (mp4, mov, mkv, webm, avi, m4v)"));
};


export const uploadVideo = multer({
storage,
fileFilter,
limits: { fileSize: 500 * 1024 * 1024 }, // 500MB cap; adjust as needed
});