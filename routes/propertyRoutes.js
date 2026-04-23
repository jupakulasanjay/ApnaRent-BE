import { Router } from "express"
import {
  create, update, submit, uploadImages,
  listMy, listPublic, getPublic
} from "../controllers/propertyController.js"
import { authenticate, optionalAuthenticate, requireOwner } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { upload, processImages } from "../middleware/uploadMiddleware.js"
import {
  createPropertyBody, updatePropertyBody, publicPropertiesQuery
} from "../validators/propertyValidators.js"
import { idParam } from "../validators/common.js"

const router = Router()

// Public — active properties only
router.get("/",     validate({ query: publicPropertiesQuery }), listPublic)
router.get("/my",   authenticate, requireOwner, listMy)
router.get("/:id",  optionalAuthenticate, validate({ params: idParam }), getPublic)

// Owner-only writes
router.post("/",
  authenticate, requireOwner,
  validate({ body: createPropertyBody }),
  create
)
router.put("/:id",
  authenticate, requireOwner,
  validate({ params: idParam, body: updatePropertyBody }),
  update
)
router.post("/:id/submit",
  authenticate, requireOwner,
  validate({ params: idParam }),
  submit
)
router.post("/:id/images",
  authenticate, requireOwner,
  validate({ params: idParam }),
  upload.array("images", 15),
  processImages("property-images"),
  uploadImages
)

export default router
