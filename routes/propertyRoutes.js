import { Router } from "express"
import {
  getProperties,
  getProperty,
  createPropertyHandler,
  updatePropertyHandler,
  deletePropertyHandler
} from "../controllers/propertyController.js"
import authMiddleware from "../middleware/authMiddleware.js"
import { upload, processImages } from "../middleware/uploadMiddleware.js"

const router = Router()

// Public
router.get("/", getProperties)
router.get("/:id", getProperty)

// Admin (JWT-protected)
router.post("/", authMiddleware, upload.array("images", 15), processImages, createPropertyHandler)
router.put("/:id", authMiddleware, upload.array("images", 15), processImages, updatePropertyHandler)
router.delete("/:id", authMiddleware, deletePropertyHandler)

export default router
