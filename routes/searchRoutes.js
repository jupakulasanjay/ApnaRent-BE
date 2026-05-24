import { Router } from "express";
import { search } from "../controllers/searchController.js";
import { validate } from "../middleware/validateMiddleware.js";
import { searchBody } from "../validators/searchValidators.js";

const searchRoute = Router();

// Rentals NL search.
searchRoute.post("/rentals", validate({ body: searchBody }), search);

export default searchRoute;
