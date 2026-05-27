import { Router } from "express";
import {
  create,
  update,
  submit,
  uploadImages,
  listMy,
  listPublic,
  getPublic,
  removeImage,
  remove,
} from "../../controllers/rentals/listingController.js";
import {
  authenticate,
  optionalAuthenticate,
  requireOwner,
  requireRole,
} from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validateMiddleware.js";
import { upload, processImages } from "../../middleware/uploadMiddleware.js";
import {
  createListingBody,
  updateListingBody,
  publicListingsQuery,
  ownedListingsQuery,
} from "../../validators/rentals/listingValidators.js";
import { idParam, idAndImageIdParam } from "../../validators/_shared/common.js";
import { USER_ROLE } from "../../utils/constants.js";

const LISTING_IMAGES_S3_PREFIX = "listing-images";
const MAX_LISTING_IMAGES = 15;

const ownerOrAdmin = requireRole(USER_ROLE.OWNER, USER_ROLE.ADMIN);

const rentalRoute = Router();

rentalRoute.get("/", validate({ query: publicListingsQuery }), listPublic);
rentalRoute.get(
  "/owned",
  authenticate,
  ownerOrAdmin,
  validate({ query: ownedListingsQuery }),
  listMy,
);
rentalRoute.get(
  "/:id",
  optionalAuthenticate,
  validate({ params: idParam }),
  getPublic,
);

rentalRoute.post(
  "/",
  authenticate,
  requireOwner,
  validate({ body: createListingBody }),
  create,
);
rentalRoute.put(
  "/:id",
  authenticate,
  requireOwner,
  validate({ params: idParam, body: updateListingBody }),
  update,
);
rentalRoute.post(
  "/:id/submit",
  authenticate,
  requireOwner,
  validate({ params: idParam }),
  submit,
);
rentalRoute.post(
  "/:id/images",
  authenticate,
  requireOwner,
  validate({ params: idParam }),
  upload.array("images", MAX_LISTING_IMAGES),
  processImages(LISTING_IMAGES_S3_PREFIX),
  uploadImages,
);

// Status gate (active blocks owners, admins unrestricted) lives in the service layer.
rentalRoute.delete(
  "/:id/images/:imageId",
  authenticate,
  ownerOrAdmin,
  validate({ params: idAndImageIdParam }),
  removeImage,
);
rentalRoute.delete(
  "/:id",
  authenticate,
  ownerOrAdmin,
  validate({ params: idParam }),
  remove,
);

export default rentalRoute;
