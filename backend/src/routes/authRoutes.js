import express from 'express';
import { requestCode, verifyDeviceStatus } from '../controllers/authController.js';

const router = express.Router();

// Device pairing requests
router.post('/request-code', requestCode);
router.get('/verify-device', verifyDeviceStatus);

export default router;
