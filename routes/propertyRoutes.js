import { Router } from "express"
import {
  getProperties,
  getProperty,
  createPropertyHandler,
  updatePropertyHandler,
  deletePropertyHandler
} from "../controllers/propertyController.js"
import { markInterest, unmarkInterest } from "../controllers/interestController.js"
import { authenticate, requireRole } from "../middleware/authMiddleware.js"
import { upload, processImages } from "../middleware/uploadMiddleware.js"

const router = Router()

// Public (approved properties only)
router.get("/", getProperties)
router.get("/:id", getProperty)

// Owner creates / manages own listings (admin can moderate any)
router.post(
  "/",
  authenticate,
  requireRole("owner"),
  upload.array("images", 15),
  processImages,
  createPropertyHandler
)
router.put(
  "/:id",
  authenticate,
  requireRole("owner", "admin"),
  upload.array("images", 15),
  processImages,
  updatePropertyHandler
)
router.delete("/:id", authenticate, requireRole("owner", "admin"), deletePropertyHandler)

// Interests (logged-in users)
router.post("/:id/interest", authenticate, requireRole("user"), markInterest)
router.delete("/:id/interest", authenticate, requireRole("user"), unmarkInterest)

export default router
