import rateLimit from "express-rate-limit";

// Keyed by IP only. Earlier version keyed by body.session_id which was
// trivially bypassable by spamming new session IDs.
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
