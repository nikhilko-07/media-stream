import express from 'express';
import multer from 'multer';
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

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

export const createAdminRouter = (io) => {
  const router = express.Router();

  // Public callback from Google OAuth redirect (doesn't have x-admin-key header)
  router.get('/google/callback', handleGoogleCallback);

  // All routes below require Admin Key
  router.use(requireAdmin);

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

  // Media Management (Upload & Delete)
  router.post('/upload', upload.single('file'), uploadMedia);
  router.get('/media', listAllMedia);
  router.delete('/media/:id', deleteMedia);

  return router;
};
