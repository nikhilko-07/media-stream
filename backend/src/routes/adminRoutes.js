import express from 'express';
import multer from 'multer';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  verifyAdmin,
  getNetworkInfo,
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
  deleteMedia
} from '../controllers/adminController.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

export const createAdminRouter = (io) => {
  const router = express.Router();

  // All routes below require Admin Key
  router.use(requireAdmin);

  // Admin Verification (Accept both GET and POST)
  router.get('/verify', verifyAdmin);
  router.post('/verify', verifyAdmin);
  router.get('/network', getNetworkInfo);

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
