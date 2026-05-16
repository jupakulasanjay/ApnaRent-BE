import { Router } from "express"
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import {
  listPendingListings, approveListing, rejectListing,
  listPendingProperties, approveProperty, rejectProperty
} from "../controllers/adminController.js"
import {
  listListingContactsForAdmin,
  listPropertyContactsForAdmin,
  listGeneralContactsForAdmin
} from "../controllers/contactController.js"
import { idParam } from "../validators/common.js"
import { rejectListingBody } from "../validators/listingValidators.js"
import { rejectPropertyBody } from "../validators/propertyValidators.js"

const router = Router()

router.use(authenticate, requireAdmin)

// Rentals moderation
router.get("/rentals/pending",      listPendingListings)
router.post("/rentals/:id/approve", validate({ params: idParam }), approveListing)
router.post("/rentals/:id/reject",  validate({ params: idParam, body: rejectListingBody }), rejectListing)

// Properties moderation
router.get("/properties/pending",      listPendingProperties)
router.post("/properties/:id/approve", validate({ params: idParam }), approveProperty)
router.post("/properties/:id/reject",  validate({ params: idParam, body: rejectPropertyBody }), rejectProperty)

// Contact requests — read-only inbox across all users, split by target kind.
router.get("/rentals/contacts",    listListingContactsForAdmin)
router.get("/properties/contacts", listPropertyContactsForAdmin)
router.get("/contacts/general",    listGeneralContactsForAdmin)

export default router
