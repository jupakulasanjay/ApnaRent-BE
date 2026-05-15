import { Router } from "express"
import {
  create, update, submit, uploadImages,
  listMy, listPublic, getPublic, removeImage, remove
} from "../controllers/propertyController.js"
import { authenticate, optionalAuthenticate, requireRole } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { upload, processImages } from "../middleware/uploadMiddleware.js"
import {
  createPropertyBody, updatePropertyBody, publicPropertiesQuery
} from "../validators/propertyValidators.js"
import { idParam, idAndImageIdParam } from "../validators/common.js"

const router = Router()

// Owners list their drafts/active inventory; admins list their own ApnaRent inventory.
const ownerOrAdmin = requireRole("owner", "admin")

// Public — active properties only
router.get("/",     validate({ query: publicPropertiesQuery }), listPublic)
router.get("/my",   authenticate, ownerOrAdmin, listMy)
router.get("/:id",  optionalAuthenticate, validate({ params: idParam }), getPublic)

// Owner + admin writes (each can only edit properties they themselves own)
router.post("/",
  authenticate, ownerOrAdmin,
  validate({ body: createPropertyBody }),
  create
)
router.put("/:id",
  authenticate, ownerOrAdmin,
  validate({ params: idParam, body: updatePropertyBody }),
  update
)
router.post("/:id/submit",
  authenticate, ownerOrAdmin,
  validate({ params: idParam }),
  submit
)
router.post("/:id/images",
  authenticate, ownerOrAdmin,
  validate({ params: idParam }),
  upload.array("images", 15),
  processImages("property-images"),
  uploadImages
)

// Owner-or-admin destructive endpoints. Status gate (active blocks owners,
// admins unrestricted) is enforced in the service layer.
router.delete("/:id/images/:imageId",
  authenticate, ownerOrAdmin,
  validate({ params: idAndImageIdParam }),
  removeImage
)
router.delete("/:id",
  authenticate, ownerOrAdmin,
  validate({ params: idParam }),
  remove
)

export default router
