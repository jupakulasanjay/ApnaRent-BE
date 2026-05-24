import multer from "multer";
import sharp from "sharp";
import crypto from "crypto";
import { uploadBuffer } from "../services/_shared/s3Service.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 15;
const WEBP_QUALITY = 82;

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(
        Object.assign(new Error("Only image uploads are allowed"), {
          status: 400,
        }),
      );
    }
    cb(null, true);
  },
});

// Factory: processImages("listing-images"). Converts each uploaded file to
// WebP and uploads to S3 under <subdir>/. Sets req.imagePaths to the URLs so
// the next handler can persist them.
export function processImages(subdir) {
  return async (req, res, next) => {
    try {
      req.imagePaths = [];
      if (!req.files || req.files.length === 0) return next();

      req.imagePaths = await Promise.all(
        req.files.map(async (file) => {
          const webp = await sharp(file.buffer)
            .rotate()
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
          const key = `${subdir}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`;
          return uploadBuffer(key, webp, "image/webp");
        }),
      );

      next();
    } catch (err) {
      next(err);
    }
  };
}
