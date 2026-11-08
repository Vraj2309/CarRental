import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export const MAX_IMAGES_PER_CAR = 8;
export const MAX_FILES_PER_UPLOAD = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// multer reads "multipart/form-data" requests: the format browsers use to
// send files. express.json() cannot read files, which is why we need it.
//
// memoryStorage keeps each file in RAM as a Buffer instead of writing it to
// disk. We pass that buffer straight to Cloudinary, so nothing is left on the
// server. That matters on hosts like Render, whose disk is wiped on restart.
export const uploadCarImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file: stops huge uploads filling RAM
    files: MAX_FILES_PER_UPLOAD,
  },
  fileFilter: (_req, file, cb) => {
    // Only real image types. A renamed .exe still has the wrong mimetype.
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new ApiError(400, 'Only JPG, PNG and WEBP images are allowed'));
  },
}).array('images', MAX_FILES_PER_UPLOAD); // form field name must be "images"
