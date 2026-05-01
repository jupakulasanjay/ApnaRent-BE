import { Router } from "express"
import { create } from "../controllers/contactController.js"
import { authenticate, requireRole } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { createContactBody } from "../validators/contactValidators.js"

const router = Router()

// Any logged-in non-admin (tenant or owner) can contact about a listing or property.
router.post("/",
  authenticate,
  requireRole("tenant", "owner"),
  validate({ body: createContactBody }),
  create
)

export default router
