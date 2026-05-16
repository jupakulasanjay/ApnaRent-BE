import { Router } from "express"
import { search, searchProperties } from "../controllers/searchController.js"
import { validate } from "../middleware/validateMiddleware.js"
import { searchBody } from "../validators/searchValidators.js"

const router = Router()

// Rentals NL search.
router.post("/rentals",    validate({ body: searchBody }), search)

// Property (for-sale) NL search — same body shape, different extraction.
router.post("/properties", validate({ body: searchBody }), searchProperties)

export default router
