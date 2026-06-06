import { Router } from "express";
import { search } from "../../controllers/search/searchController.js";
import { validate } from "../../middleware/validateMiddleware.js";
import { searchBody } from "../../validators/search/searchValidators.js";

const searchRoute = Router();

searchRoute.post("/rentals", validate({ body: searchBody }), search);

export default searchRoute;
