import * as communityService from "../../services/communities/communityService.js";

// ---- Public ----

export async function listPublic(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total } = await communityService.listPublicCommunities({
      limit,
      offset,
    });
    res.json({ count: total, limit, offset, data });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req, res, next) {
  try {
    const community = await communityService.getCommunityWithImages(
      req.params.id,
    );
    res.json(community);
  } catch (err) {
    next(err);
  }
}

export async function listRentals(req, res, next) {
  try {
    const data = await communityService.listCommunityRentals(req.params.id, {
      activeOnly: true,
    });
    res.json({ count: data.length, data });
  } catch (err) {
    next(err);
  }
}

export async function listProperties(req, res, next) {
  try {
    const data = await communityService.listCommunityProperties(req.params.id, {
      activeOnly: true,
    });
    res.json({ count: data.length, data });
  } catch (err) {
    next(err);
  }
}

// ---- Admin ----

export async function create(req, res, next) {
  try {
    const community = await communityService.createCommunityAsAdmin(
      req.user.id,
      req.body,
    );
    res.status(201).json(community);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const community = await communityService.updateCommunityById(
      req.params.id,
      req.body,
    );
    res.json(community);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await communityService.removeCommunity(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function uploadImages(req, res, next) {
  try {
    const images = await communityService.addImagesToCommunity(
      req.params.id,
      req.imagePaths || [],
    );
    res.status(201).json({ count: images.length, data: images });
  } catch (err) {
    next(err);
  }
}

export async function removeImage(req, res, next) {
  try {
    await communityService.removeCommunityImageById(
      req.params.id,
      req.params.imageId,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Admin detail: community + both member lists (every status).
export async function getOneForAdmin(req, res, next) {
  try {
    const [community, rentals, properties] = await Promise.all([
      communityService.getCommunityWithImages(req.params.id),
      communityService.listCommunityRentals(req.params.id, {
        activeOnly: false,
      }),
      communityService.listCommunityProperties(req.params.id, {
        activeOnly: false,
      }),
    ]);
    res.json({ ...community, rentals, properties });
  } catch (err) {
    next(err);
  }
}

export async function linkRentals(req, res, next) {
  try {
    await communityService.linkRentalsToCommunity(
      req.params.id,
      req.body.listing_ids,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function unlinkRental(req, res, next) {
  try {
    await communityService.unlinkRentalFromCommunity(
      req.params.id,
      req.params.listingId,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function linkProperties(req, res, next) {
  try {
    await communityService.linkPropertiesToCommunity(
      req.params.id,
      req.body.property_ids,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function unlinkProperty(req, res, next) {
  try {
    await communityService.unlinkPropertyFromCommunity(
      req.params.id,
      req.params.propertyId,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
