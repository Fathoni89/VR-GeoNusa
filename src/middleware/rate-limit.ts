import rateLimit from 'express-rate-limit';

export function createPublicWriteLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Terlalu banyak permintaan, coba lagi sebentar.',
    },
  });
}

export function createStaffLoginLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Terlalu banyak percobaan login, coba lagi nanti.',
    },
  });
}
