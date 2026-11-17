import express from 'express';
import { requestCode, verifyDeviceStatus, checkPairingStatus } from '../controllers/authController.js';

const router = express.Router();

// Device pairing requests
router.post('/request-code', requestCode);
router.get('/verify-device', verifyDeviceStatus);
router.get('/pairing-status/:code', checkPairingStatus);

export default router;
