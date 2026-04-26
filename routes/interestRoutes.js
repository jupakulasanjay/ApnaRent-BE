import { Router } from "express"
import { list, create, remove } from "../controllers/interestController.js"
import { authenticate } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { createInterestBody, interestPathParams } from "../validators/interestValidators.js"

const router = Router()

// Any authenticated user (tenant, owner, admin) can manage their own interests.
router.get("/", authenticate, list)

router.post("/",
  authenticate,
  validate({ body: createInterestBody }),
  create
)

router.delete("/:kind/:id",
  authenticate,
  validate({ params: interestPathParams }),
  remove
)

export default router
