import { Router } from "express"
import { search, searchProperties } from "../controllers/searchController.js"
import { validate } from "../middleware/validateMiddleware.js"
import { searchBody } from "../validators/searchValidators.js"

const router = Router()

// Rental (listings) NL search — unchanged.
router.post("/",           validate({ body: searchBody }), search)

// Property (for-sale) NL search — same body shape, different extraction + data source.
router.post("/properties", validate({ body: searchBody }), searchProperties)

export default router
