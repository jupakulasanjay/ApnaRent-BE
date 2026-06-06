import * as interestService from "../../services/interests/interestService.js";

export async function list(req, res, next) {
  try {
    const data = await interestService.listInterestsForUser(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { interest, created } = await interestService.saveInterest(req.user, {
      listingId: req.body.listing_id,
    });
    res.status(created ? 201 : 200).json(interest);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await interestService.removeInterest(req.user, { targetId: req.params.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
