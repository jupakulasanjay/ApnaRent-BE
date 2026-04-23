import * as listingService from "../services/listingService.js"

export async function create(req, res, next) {
  try {
    const listing = await listingService.createListingForOwner(req.user.id, req.body)
    res.status(201).json(listing)
  } catch (err) {
    next(err)
  }
}

export async function update(req, res, next) {
  try {
    const listing = await listingService.updateListingForOwner(req.user.id, req.params.id, req.body)
    res.json(listing)
  } catch (err) {
    next(err)
  }
}

export async function submit(req, res, next) {
  try {
    const listing = await listingService.submitListingForVerification(req.user.id, req.params.id)
    res.json(listing)
  } catch (err) {
    next(err)
  }
}

export async function uploadImages(req, res, next) {
  try {
    const images = await listingService.addImagesToListing(req.user.id, req.params.id, req.imagePaths || [])
    res.status(201).json({ count: images.length, data: images })
  } catch (err) {
    next(err)
  }
}

export async function listMy(req, res, next) {
  try {
    const rows = await listingService.listMyListings(req.user.id)
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function listPublic(req, res, next) {
  try {
    const { city, locality, bhk, max_rent, limit, offset } = req.query
    const rows = await listingService.listPublic({
      city, locality, bhk, maxRent: max_rent, limit, offset
    })
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function getPublic(req, res, next) {
  try {
    const listing = await listingService.getPublicListing(req.params.id)
    res.json(listing)
  } catch (err) {
    next(err)
  }
}
