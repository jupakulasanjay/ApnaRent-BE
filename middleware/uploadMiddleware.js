import multer from "multer"
import sharp from "sharp"
import fs from "fs/promises"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "uploads/property-images"
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB per file
const MAX_FILES = 15

const storage = multer.memoryStorage()

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(Object.assign(new Error("Only image uploads are allowed"), { status: 400 }))
    }
    cb(null, true)
  }
})

export async function processImages(req, res, next) {
  try {
    req.imagePaths = []
    if (!req.files || req.files.length === 0) return next()

    await fs.mkdir(UPLOAD_DIR, { recursive: true })

    req.imagePaths = await Promise.all(
      req.files.map(async (file) => {
        const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`
        const diskPath = path.join(UPLOAD_DIR, filename)
        await sharp(file.buffer)
          .rotate()
          .webp({ quality: 82 })
          .toFile(diskPath)
        return `/${UPLOAD_DIR}/${filename}`
      })
    )

    next()
  } catch (err) {
    next(err)
  }
}
