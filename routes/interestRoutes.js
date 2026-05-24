import { Router } from "express"
import { list, create, remove } from "../controllers/interestController.js"
import { authenticate } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { createInterestBody, interestPathParams } from "../validators/interestValidators.js"

const interestRoute = Router()

// Any authenticated user (tenant, owner, admin) can manage their own interests.
interestRoute.get("/", authenticate, list)

interestRoute.post("/",
  authenticate,
  validate({ body: createInterestBody }),
  create
)

interestRoute.delete("/:kind/:id",
  authenticate,
  validate({ params: interestPathParams }),
  remove
)

export default interestRoute
