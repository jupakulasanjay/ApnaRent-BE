import { Router } from "express"
import {
  create, update, submit, uploadImages,
  listMy, listPublic, getPublic
} from "../controllers/listingController.js"
import { authenticate, requireOwner } from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { upload, processImages } from "../middleware/uploadMiddleware.js"
import {
  createListingBody, updateListingBody, publicListingsQuery
} from "../validators/listingValidators.js"
import { idParam } from "../validators/common.js"

const router = Router()

// Public — active listings only
router.get("/",     validate({ query: publicListingsQuery }), listPublic)
router.get("/my",   authenticate, requireOwner, listMy)
router.get("/:id",  validate({ params: idParam }), getPublic)

// Owner-only writes
router.post("/",
  authenticate, requireOwner,
  validate({ body: createListingBody }),
  create
)
router.put("/:id",
  authenticate, requireOwner,
  validate({ params: idParam, body: updateListingBody }),
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
  processImages("listing-images"),
  uploadImages
)

export default router
