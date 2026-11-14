import express from 'express';
import { requireDeviceAuth } from '../middleware/deviceAuth.js';
import { getMediaCatalog, getMediaById, streamMedia } from '../controllers/mediaController.js';

const router = express.Router();

// Require authorized device token
router.use(requireDeviceAuth);

// Catalog & streaming
router.get('/', getMediaCatalog);
router.get('/:id', getMediaById);
router.get('/stream/:id', streamMedia);

export default router;
