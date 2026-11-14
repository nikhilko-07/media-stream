export const requireAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  const expectedKey = process.env.ADMIN_SECRET_KEY || 'admin1234';

  if (!adminKey || adminKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing Admin Key'
    });
  }

  next();
};
