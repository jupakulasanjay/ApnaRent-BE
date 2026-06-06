import * as listingService from "../../services/rentals/listingService.js";

export async function create(req, res, next) {
  try {
    const listing = await listingService.createListingForOwner(
      req.user.id,
      req.body,
    );
    res.status(201).json(listing);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const listing = await listingService.updateListingForOwner(
      req.user.id,
      req.params.id,
      req.body,
    );
    res.json(listing);
  } catch (err) {
    next(err);
  }
}

export async function submit(req, res, next) {
  try {
    const listing = await listingService.submitListingForVerification(
      req.user.id,
      req.params.id,
    );
    res.json(listing);
  } catch (err) {
    next(err);
  }
}

export async function uploadImages(req, res, next) {
  try {
    const images = await listingService.addImagesToListing(
      req.user.id,
      req.params.id,
      req.imagePaths || [],
    );
    res.status(201).json({ count: images.length, data: images });
  } catch (err) {
    next(err);
  }
}

export async function listMy(req, res, next) {
  try {
    const { status, limit, offset } = req.query;
    const result = await listingService.listMyListings(req.user.id, {
      status,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listPublic(req, res, next) {
  try {
    const { city, locality, bhk, max_rent, limit, offset } = req.query;
    const { rows, total } = await listingService.listPublic({
      city,
      locality,
      bhk,
      maxRent: max_rent,
      limit,
      offset,
    });
    res.json({ count: total, limit, offset, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getPublic(req, res, next) {
  try {
    const listing = await listingService.getListingForRequester(
      req.params.id,
      req.user || null,
    );
    res.json(listing);
  } catch (err) {
    next(err);
  }
}

export async function removeImage(req, res, next) {
  try {
    await listingService.removeListingImage(
      req.user,
      req.params.id,
      req.params.imageId,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await listingService.removeListing(req.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
