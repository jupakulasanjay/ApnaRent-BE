import { Router } from "express"
import {
  create, update, submit, uploadImages,
  listMy, listPublic, getPublic, removeImage, remove
} from "../controllers/listingController.js"
import {
  authenticate, optionalAuthenticate, requireOwner, requireRole
} from "../middleware/authMiddleware.js"
import { validate } from "../middleware/validateMiddleware.js"
import { upload, processImages } from "../middleware/uploadMiddleware.js"
import {
  createListingBody, updateListingBody, publicListingsQuery
} from "../validators/listingValidators.js"
import { idParam, idAndImageIdParam } from "../validators/common.js"

const ownerOrAdmin = requireRole("owner", "admin")

const rentalRoute = Router()

// Public — active rentals only
rentalRoute.get("/",      validate({ query: publicListingsQuery }), listPublic)
rentalRoute.get("/owned", authenticate, requireOwner, listMy)
rentalRoute.get("/:id",   optionalAuthenticate, validate({ params: idParam }), getPublic)

// Owner-only writes
rentalRoute.post("/",
  authenticate, requireOwner,
  validate({ body: createListingBody }),
  create
)
rentalRoute.put("/:id",
  authenticate, requireOwner,
  validate({ params: idParam, body: updateListingBody }),
  update
)
rentalRoute.post("/:id/submit",
  authenticate, requireOwner,
  validate({ params: idParam }),
  submit
)
rentalRoute.post("/:id/images",
  authenticate, requireOwner,
  validate({ params: idParam }),
  upload.array("images", 15),
  processImages("listing-images"),
  uploadImages
)

// Owner-or-admin destructive endpoints. Status gate (active blocks owners,
// admins unrestricted) is enforced in the service layer.
rentalRoute.delete("/:id/images/:imageId",
  authenticate, ownerOrAdmin,
  validate({ params: idAndImageIdParam }),
  removeImage
)
rentalRoute.delete("/:id",
  authenticate, ownerOrAdmin,
  validate({ params: idParam }),
  remove
)

export default rentalRoute
