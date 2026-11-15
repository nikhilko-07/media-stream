import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  verifyAdmin,
  getNetworkInfo,
  toggleLocalNetwork,
  getTunnelStatus,
  startTunnel,
  stopTunnel,
  generateQuickAccessLink,
  listPendingDevices,
  approveDevice,
  listActiveDevices,
  revokeDevice,
  uploadMedia,
  listAllMedia,
  deleteMedia,
  getStorageOverview,
  setActiveStorageProvider,
  saveGoogleCredentials,
  getGoogleAuthUrl,
  handleGoogleCallback,
  disconnectGoogleDrive
} from '../controllers/adminController.js';

import {
  getAdminAuthInfo,
  sendAdminLoginOtp,
  verifyAdminLoginOtp
} from '../controllers/adminAuthController.js';

const tempUploadDir = path.join(os.tmpdir(), 'local_stream_uploads');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB limit
});

const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File size exceeds maximum supported limit (10 GB).'
        });
      }
      return res.status(400).json({
        success: false,
        error: `File upload error: ${err.message}`
      });
    }
    next();
  });
};

export const createAdminRouter = (io, server) => {
  const router = express.Router();

  // Public OTP Login Endpoints
  router.get('/auth/info', getAdminAuthInfo);
  router.post('/auth/send-otp', sendAdminLoginOtp);
  router.post('/auth/verify-otp', verifyAdminLoginOtp);

  // Public callback from Google OAuth redirect (doesn't have x-admin-key header)
  router.get('/google/callback', handleGoogleCallback);

  // All routes below require Admin Key / 24h JWT Token
  router.use(requireAdmin);

  // Complete Server Shutdown & Port Release
  router.post('/server/shutdown', (req, res) => {
    res.json({
      success: true,
      message: 'Server process terminated. Port 9086 has been completely closed and released.'
    });

    console.log('\n🛑 [SHUTDOWN REQUEST] Admin stopped the webserver.');
    console.log('🔌 Closing port 9086 and terminating process...\n');

    setTimeout(() => {
      if (server) {
        server.close(() => {
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    }, 400);
  });

  // Storage Overview & Provider Switcher
  router.get('/storage/status', getStorageOverview);
  router.post('/storage/provider', setActiveStorageProvider);
  router.post('/google/credentials', saveGoogleCredentials);
  router.get('/google/auth-url', getGoogleAuthUrl);
  router.post('/google/disconnect', disconnectGoogleDrive);

  // Admin Verification (Accept both GET and POST)
  router.get('/verify', verifyAdmin);
  router.post('/verify', verifyAdmin);
  router.get('/network', getNetworkInfo);
  router.post('/network/toggle', toggleLocalNetwork(io));

  // Online Tunnel Controls (Start/Stop from web UI)
  router.get('/tunnel', getTunnelStatus);
  router.post('/tunnel/start', startTunnel);
  router.post('/tunnel/stop', stopTunnel);
  router.post('/quick-link', generateQuickAccessLink);

  // Device Management (Admit / Revoke)
  router.get('/pending', listPendingDevices);
  router.post('/approve', approveDevice(io));
  router.get('/devices', listActiveDevices);
  router.delete('/device/:id', revokeDevice);

  // Media Management (Upload & Delete with streaming disk storage for 10GB+)
  router.post('/upload', uploadMiddleware, uploadMedia);
  router.get('/media', listAllMedia);
  router.delete('/media/:id', deleteMedia);

  return router;
};
