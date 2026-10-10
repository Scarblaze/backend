import multer from 'multer';

// Memory storage: the buffer goes to Cloudinary or MongoDB (Vercel has no writable disk).
// The Flutter http package sends files as application/octet-stream, so the real
// check is done on the file signature in services/storage.js (sniffImage).
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
}).single('image');
