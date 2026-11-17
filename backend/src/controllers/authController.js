import jwt from 'jsonwebtoken';
import { DeviceSession } from '../models/DeviceSession.js';

// Device requests pairing code (Shown on TV / Phone / Browser)
export const requestCode = async (req, res) => {
  try {
    const rawNum = Math.floor(100000 + Math.random() * 900000).toString();
    const pairingCode = `${rawNum.slice(0, 3)}-${rawNum.slice(3)}`;

    const deviceName = req.body?.deviceName || req.headers['user-agent'] || 'Web Client';

    const session = await DeviceSession.create({
      pairingCode,
      deviceName,
      ipAddress: req.ip,
      status: 'PENDING'
    });

    res.status(201).json({
      success: true,
      pairingCode,
      expiresInSeconds: 600,
      sessionId: session._id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Check if device token stored in localStorage is still valid
export const verifyDeviceStatus = async (req, res) => {
  try {
    const token = req.headers['x-device-token'] || req.query.deviceToken;
    if (!token) {
      return res.status(401).json({ success: false, authorized: false });
    }

    const secret = process.env.DEVICE_JWT_SECRET || 'device_jwt_secret_key_1234';
    const decoded = jwt.verify(token, secret);

    const session = await DeviceSession.findById(decoded.sessionId);
    if (!session || session.status !== 'APPROVED') {
      return res.status(403).json({ success: false, authorized: false });
    }

    res.json({
      success: true,
      authorized: true,
      deviceName: session.deviceName,
      approvedAt: session.approvedAt
    });
  } catch (error) {
    res.status(401).json({ success: false, authorized: false, error: error.message });
  }
};

// Check pairing code status (Allows waiting client to poll if socket drops on mobile/Cloudflare)
export const checkPairingStatus = async (req, res) => {
  try {
    let { code } = req.params;
    if (!code) {
      return res.status(400).json({ success: false, error: 'Pairing code is required' });
    }

    code = String(code).trim();
    let formattedCode = code;
    if (/^\d{6}$/.test(code)) {
      formattedCode = `${code.slice(0, 3)}-${code.slice(3)}`;
    }

    const session = await DeviceSession.findOne({
      pairingCode: { $in: [code, formattedCode] }
    });

    if (!session) {
      return res.json({ success: true, status: 'EXPIRED' });
    }

    if (session.status === 'APPROVED' && session.deviceAccessToken) {
      return res.json({
        success: true,
        status: 'APPROVED',
        deviceAccessToken: session.deviceAccessToken,
        deviceName: session.deviceName
      });
    }

    res.json({
      success: true,
      status: session.status || 'PENDING'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
