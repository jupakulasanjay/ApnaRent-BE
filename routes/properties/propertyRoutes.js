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
} from "../../controllers/properties/propertyController.js";
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
} from "../../middleware/authMiddleware.js";
import { validate } from "../../middleware/validateMiddleware.js";
import { upload, processImages } from "../../middleware/uploadMiddleware.js";
import {
  createPropertyBody,
  updatePropertyBody,
  publicPropertiesQuery,
  ownedPropertiesQuery,
} from "../../validators/properties/propertyValidators.js";
import { idParam, idAndImageIdParam } from "../../validators/_shared/common.js";
import { USER_ROLE } from "../../utils/constants.js";
import {
  PROPERTY_IMAGES_S3_PREFIX,
  MAX_PROPERTY_IMAGES,
} from "../../services/properties/propertyConstants.js";

const ownerOrAdmin = requireRole(USER_ROLE.OWNER, USER_ROLE.ADMIN);

const propertyRoute = Router();

propertyRoute.get("/", validate({ query: publicPropertiesQuery }), listPublic);
propertyRoute.get(
  "/owned",
  authenticate,
  ownerOrAdmin,
  validate({ query: ownedPropertiesQuery }),
  listMy,
);
propertyRoute.get(
  "/:id",
  optionalAuthenticate,
  validate({ params: idParam }),
  getPublic,
);

propertyRoute.post(
  "/",
  authenticate,
  ownerOrAdmin,
  validate({ body: createPropertyBody }),
  create,
);
propertyRoute.put(
  "/:id",
  authenticate,
  ownerOrAdmin,
  validate({ params: idParam, body: updatePropertyBody }),
  update,
);
propertyRoute.post(
  "/:id/submit",
  authenticate,
  ownerOrAdmin,
  validate({ params: idParam }),
  submit,
);
propertyRoute.post(
  "/:id/images",
  authenticate,
  ownerOrAdmin,
  validate({ params: idParam }),
  upload.array("images", MAX_PROPERTY_IMAGES),
  processImages(PROPERTY_IMAGES_S3_PREFIX),
  uploadImages,
);

// Status gate (active blocks owners, admins unrestricted) lives in the service layer.
propertyRoute.delete(
  "/:id/images/:imageId",
  authenticate,
  ownerOrAdmin,
  validate({ params: idAndImageIdParam }),
  removeImage,
);
propertyRoute.delete(
  "/:id",
  authenticate,
  ownerOrAdmin,
  validate({ params: idParam }),
  remove,
);

export default propertyRoute;
