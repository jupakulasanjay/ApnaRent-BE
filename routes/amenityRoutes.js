import { Router } from "express"
import { get } from "../controllers/amenityController.js"
import { validate } from "../middleware/validateMiddleware.js"
import { amenitiesQuery } from "../validators/amenityValidators.js"

const router = Router()

// Public — no auth required, the catalogue is just a static dropdown source.
router.get("/", validate({ query: amenitiesQuery }), get)

export default router
