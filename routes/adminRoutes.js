import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validateMiddleware.js";
import {
  listPendingListings,
  approveListing,
  rejectListing,
} from "../controllers/adminController.js";
import {
  listListingContactsForAdmin,
  listGeneralContactsForAdmin,
} from "../controllers/contactController.js";
import { idParam } from "../validators/common.js";
import { rejectListingBody } from "../validators/listingValidators.js";

const adminRoute = Router();

adminRoute.use(authenticate, requireAdmin);

// Rentals moderation
adminRoute.get("/rentals/pending", listPendingListings);
adminRoute.post(
  "/rentals/:id/approve",
  validate({ params: idParam }),
  approveListing,
);
adminRoute.post(
  "/rentals/:id/reject",
  validate({ params: idParam, body: rejectListingBody }),
  rejectListing,
);

// Contact requests — read-only inbox across all users, split by target kind.
adminRoute.get("/rentals/contacts", listListingContactsForAdmin);
adminRoute.get("/contacts/general", listGeneralContactsForAdmin);

export default adminRoute;
