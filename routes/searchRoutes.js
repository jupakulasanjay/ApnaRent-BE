import { Router } from "express"
import { search } from "../controllers/searchController.js"
import { validate } from "../middleware/validateMiddleware.js"
import { searchBody } from "../validators/searchValidators.js"

const router = Router()

router.post("/", validate({ body: searchBody }), search)

export default router
