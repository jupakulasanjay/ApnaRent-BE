export const LISTING_STATUS = {
  DRAFT: "draft",
  PENDING: "pending_verification",
  ACTIVE: "active",
  REJECTED: "rejected",
  EXPIRED: "expired",
};

export const USER_ROLE = {
  TENANT: "tenant",
  OWNER: "owner",
  ADMIN: "admin",
};

export const COMMUNITY_TYPE = {
  APARTMENT: "apartment",
  VILLA: "villa",
  MIXED: "mixed",
};

export const DEFAULT_GEOCODE_CITY = "Bangalore";

export const CONTACT_KIND = {
  LISTING: "listing",
  PROPERTY: "property",
  GENERAL: "general",
};

export const INTEREST_KIND = {
  LISTING: "listing",
};

export const INTEREST_LIMIT_PER_USER = 50;

export const APNARENT_TAG = "ApnaRent";

export const AUTH = {
  BCRYPT_ROUNDS: 10,
  DEFAULT_JWT_EXPIRES_IN: "7d",
};
