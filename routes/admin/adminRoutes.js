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
import {
  create as createCommunity,
  update as updateCommunity,
  remove as removeCommunity,
  uploadImages as uploadCommunityImages,
  removeImage as removeCommunityImage,
  getOneForAdmin as getCommunityForAdmin,
  linkRentals,
  unlinkRental,
  linkProperties,
  unlinkProperty,
} from "../../controllers/communities/communityController.js";
import { upload, processImages } from "../../middleware/uploadMiddleware.js";
import {
  idParam,
  idAndImageIdParam,
  idAndListingIdParam,
  idAndPropertyIdParam,
} from "../../validators/_shared/common.js";
import { rejectListingBody } from "../../validators/rentals/listingValidators.js";
import { rejectPropertyBody } from "../../validators/properties/propertyValidators.js";
import {
  createCommunityBody,
  updateCommunityBody,
  linkRentalsBody,
  linkPropertiesBody,
} from "../../validators/communities/communityValidators.js";
import {
  COMMUNITY_IMAGES_S3_PREFIX,
  MAX_COMMUNITY_IMAGES,
} from "../../services/communities/communityConstants.js";

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

// ---- Communities ----
adminRoute.post(
  "/communities",
  validate({ body: createCommunityBody }),
  createCommunity,
);
adminRoute.get(
  "/communities/:id",
  validate({ params: idParam }),
  getCommunityForAdmin,
);
adminRoute.put(
  "/communities/:id",
  validate({ params: idParam, body: updateCommunityBody }),
  updateCommunity,
);
adminRoute.delete(
  "/communities/:id",
  validate({ params: idParam }),
  removeCommunity,
);
adminRoute.post(
  "/communities/:id/images",
  validate({ params: idParam }),
  upload.array("images", MAX_COMMUNITY_IMAGES),
  processImages(COMMUNITY_IMAGES_S3_PREFIX),
  uploadCommunityImages,
);
adminRoute.delete(
  "/communities/:id/images/:imageId",
  validate({ params: idAndImageIdParam }),
  removeCommunityImage,
);
adminRoute.post(
  "/communities/:id/rentals",
  validate({ params: idParam, body: linkRentalsBody }),
  linkRentals,
);
adminRoute.delete(
  "/communities/:id/rentals/:listingId",
  validate({ params: idAndListingIdParam }),
  unlinkRental,
);
adminRoute.post(
  "/communities/:id/properties",
  validate({ params: idParam, body: linkPropertiesBody }),
  linkProperties,
);
adminRoute.delete(
  "/communities/:id/properties/:propertyId",
  validate({ params: idAndPropertyIdParam }),
  unlinkProperty,
);

export default adminRoute;
