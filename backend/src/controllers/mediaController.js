import http from 'http';
import https from 'https';
import { Media } from '../models/Media.js';
import { googleDriveService } from '../services/googleDriveService.js';

// Get library for authorized clients
export const getMediaCatalog = async (req, res) => {
  try {
    const { type } = req.query; // optional filter: ?type=video | audio | image
    const filter = type ? { mediaType: type } : {};
    const items = await Media.find(filter).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single media details
export const getMediaById = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Media.findById(id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Stream media with HTTP Range (Partial Content 206) for smooth seeking & privacy chunking
export const streamMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    // Images don't need range streaming; redirect or pipe
    if (media.mediaType === 'image') {
      if (media.storageProvider === 'google_drive') {
        const driveRes = await googleDriveService.streamFile(media.googleDriveFileId);
        res.writeHead(200, { 'Content-Type': media.mimeType, 'Cache-Control': 'public, max-age=86400' });
        return driveRes.data.pipe(res);
      }
      return res.redirect(media.secureUrl);
    }

    // If stored on Google Drive (Stream chunks with Range headers)
    if (media.storageProvider === 'google_drive') {
      const range = req.headers.range;
      const driveRes = await googleDriveService.streamFile(media.googleDriveFileId, range);

      res.writeHead(driveRes.status || (range ? 206 : 200), {
        ...driveRes.headers,
        'Content-Type': media.mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, private'
      });

      return driveRes.data.pipe(res);
    }

    // Determine target URL and Content-Type (MKV converted to MP4 container on-the-fly by Cloudinary for universal browser playback)
    let streamUrl = media.secureUrl;
    let contentType = media.mimeType;

    const isMkv = (media.mimeType && media.mimeType.includes('matroska')) || media.secureUrl.toLowerCase().endsWith('.mkv');
    if (media.mediaType === 'video' && isMkv) {
      streamUrl = media.secureUrl.replace(/\.mkv$/i, '.mp4');
      contentType = 'video/mp4';
    }

    const range = req.headers.range;
    const targetUrl = new URL(streamUrl);
    const client = targetUrl.protocol === 'https:' ? https : http;

    const options = {
      headers: {}
    };

    if (range) {
      options.headers['Range'] = range;
    }

    client.get(streamUrl, options, (cloudRes) => {
      res.writeHead(cloudRes.statusCode || 200, {
        ...cloudRes.headers,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, private',
        'Content-Type': contentType
      });

      cloudRes.pipe(res);
    }).on('error', (err) => {
      res.status(500).json({ success: false, error: 'Stream error', details: err.message });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
