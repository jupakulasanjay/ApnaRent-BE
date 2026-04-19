import { Router } from "express"
import { authenticate, requireRole } from "../middleware/authMiddleware.js"
import { listMyProperties } from "../controllers/propertyController.js"
import { myInterests } from "../controllers/interestController.js"

const router = Router()

// Owner: their own listings (any status)
router.get("/properties", authenticate, requireRole("owner"), listMyProperties)

// User: properties they've marked interested
router.get("/interests", authenticate, requireRole("user"), myInterests)

export default router
