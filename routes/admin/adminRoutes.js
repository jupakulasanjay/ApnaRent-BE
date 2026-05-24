import { Router } from "express";
import { authenticate, requireAdmin } from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validateMiddleware.js";
import {
  listPendingListings,
  approveListing,
  rejectListing,
} from "../../controllers/admin/adminController.js";
import {
  listListingContactsForAdmin,
  listGeneralContactsForAdmin,
} from "../../controllers/contacts/contactController.js";
import { idParam } from "../../validators/_shared/common.js";
import { rejectListingBody } from "../../validators/rentals/listingValidators.js";

const adminRoute = Router();

adminRoute.use(authenticate, requireAdmin);

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

adminRoute.get("/rentals/contacts", listListingContactsForAdmin);
adminRoute.get("/contacts/general", listGeneralContactsForAdmin);

export default adminRoute;
