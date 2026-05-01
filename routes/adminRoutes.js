import { Router } from "express"
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import {
  listPendingListings, approveListing, rejectListing,
  listPendingProperties, approveProperty, rejectProperty
} from "../controllers/adminController.js"
import { idParam } from "../validators/common.js"
import { rejectListingBody } from "../validators/listingValidators.js"
import { rejectPropertyBody } from "../validators/propertyValidators.js"

const router = Router()

router.use(authenticate, requireAdmin)

// Listings moderation
router.get("/listings/pending",      listPendingListings)
router.post("/listings/:id/approve", validate({ params: idParam }), approveListing)
router.post("/listings/:id/reject",  validate({ params: idParam, body: rejectListingBody }), rejectListing)

// Properties moderation
router.get("/properties/pending",      listPendingProperties)
router.post("/properties/:id/approve", validate({ params: idParam }), approveProperty)
router.post("/properties/:id/reject",  validate({ params: idParam, body: rejectPropertyBody }), rejectProperty)

export default router
