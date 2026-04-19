import { Router } from "express"
import { authenticate, requireRole } from "../middleware/authMiddleware.js"
import { listMyProperties } from "../controllers/propertyController.js"
import { myInterests } from "../controllers/interestController.js"

const router = Router()

// User's own listings (any status)
router.get("/properties", authenticate, requireRole("user"), listMyProperties)

// Properties the user has marked interested in
router.get("/interests", authenticate, requireRole("user"), myInterests)

export default router
