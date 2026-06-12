import { Router } from "express";
import { authenticate, requireAdmin } from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validateMiddleware.js";
import {
  listPendingListings,
  approveListing,
  rejectListing,
  listPendingProperties,
  approveProperty,
  rejectProperty,
} from "../../controllers/admin/adminController.js";
import {
  listListingContactsForAdmin,
  listPropertyContactsForAdmin,
  listGeneralContactsForAdmin,
} from "../../controllers/contacts/contactController.js";
import { idParam } from "../../validators/_shared/common.js";
import { rejectListingBody } from "../../validators/rentals/listingValidators.js";
import { rejectPropertyBody } from "../../validators/properties/propertyValidators.js";

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

adminRoute.get("/properties/pending", listPendingProperties);
adminRoute.post(
  "/properties/:id/approve",
  validate({ params: idParam }),
  approveProperty,
);
adminRoute.post(
  "/properties/:id/reject",
  validate({ params: idParam, body: rejectPropertyBody }),
  rejectProperty,
);

adminRoute.get("/properties/contacts", listPropertyContactsForAdmin);

adminRoute.get("/contacts/general", listGeneralContactsForAdmin);

export default adminRoute;
