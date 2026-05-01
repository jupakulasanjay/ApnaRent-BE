import multer from "multer"
import sharp from "sharp"
import fs from "fs/promises"
import path from "path"
import crypto from "crypto"

const MAX_FILE_BYTES = 10 * 1024 * 1024
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

// Factory: processImages("listing-images") or processImages("property-images").
// Converts each uploaded file to WebP and writes to uploads/<subdir>/.
export function processImages(subdir) {
  const dir = path.posix.join("uploads", subdir)
  return async (req, res, next) => {
    try {
      req.imagePaths = []
      if (!req.files || req.files.length === 0) return next()

      await fs.mkdir(dir, { recursive: true })

      req.imagePaths = await Promise.all(
        req.files.map(async (file) => {
          const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`
          const diskPath = path.join(dir, filename)
          await sharp(file.buffer)
            .rotate()
            .webp({ quality: 82 })
            .toFile(diskPath)
          return `/${dir}/${filename}`
        })
      )

      next()
    } catch (err) {
      next(err)
    }
  }
}
