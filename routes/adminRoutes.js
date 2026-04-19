import { Router } from "express"
import { authenticate, requireRole } from "../middleware/authMiddleware.js"
import {
  listPendingAdmins,
  approveUser,
  rejectUser,
  listPendingProperties,
  approveProperty,
  rejectProperty
} from "../controllers/adminController.js"

const router = Router()

router.use(authenticate, requireRole("admin"))

// Admin approvals
router.get("/users/pending", listPendingAdmins)
router.post("/users/:id/approve", approveUser)
router.post("/users/:id/reject", rejectUser)

// Property moderation
router.get("/properties/pending", listPendingProperties)
router.post("/properties/:id/approve", approveProperty)
router.post("/properties/:id/reject", rejectProperty)

export default router
