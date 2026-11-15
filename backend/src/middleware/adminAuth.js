import jwt from 'jsonwebtoken';

export const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = req.headers['x-admin-token'];
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey;

  const jwtSecret = process.env.JWT_ADMIN_SECRET || process.env.ADMIN_SECRET_KEY || 'admin_jwt_secret_2026';
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'admin1234';

  // 1. Check Bearer Token (24h Admin Session Token)
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (tokenFromHeader) {
    token = tokenFromHeader;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (decoded && decoded.role === 'admin') {
        req.admin = decoded;
        return next();
      }
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Admin session has expired (24h limit reached). Please login again with OTP.',
        expired: true
      });
    }
  }

  // 2. Fallback to direct Master Key (for API/CLI backwards compatibility)
  if (adminKey && adminKey === expectedKey) {
    req.admin = { role: 'admin', authType: 'master_key' };
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Please verify your admin session using OTP.',
    requireOtp: true
  });
};
