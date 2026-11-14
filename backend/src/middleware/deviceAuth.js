import jwt from 'jsonwebtoken';
import { DeviceSession } from '../models/DeviceSession.js';

export const requireDeviceAuth = async (req, res, next) => {
  try {
    const token = req.headers['x-device-token'] || req.query.deviceToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Device not authorized. Please pair device via pairing code.'
      });
    }

    const secret = process.env.DEVICE_JWT_SECRET || 'device_jwt_secret_key_1234';
    const decoded = jwt.verify(token, secret);

    const session = await DeviceSession.findById(decoded.sessionId);
    if (!session || session.status !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        error: 'Device access revoked or expired. Please re-pair with Admin.'
      });
    }

    req.deviceSession = session;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid device session token',
      details: error.message
    });
  }
};
