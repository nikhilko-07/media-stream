import http from 'http';
import https from 'https';
import { Media } from '../models/Media.js';

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
      return res.redirect(media.secureUrl);
    }

    const range = req.headers.range;
    const targetUrl = new URL(media.secureUrl);
    const client = targetUrl.protocol === 'https:' ? https : http;

    const options = {
      headers: {}
    };

    if (range) {
      options.headers['Range'] = range;
    }

    client.get(media.secureUrl, options, (cloudRes) => {
      res.writeHead(cloudRes.statusCode || 200, {
        ...cloudRes.headers,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, private',
        'Content-Type': media.mimeType
      });

      cloudRes.pipe(res);
    }).on('error', (err) => {
      res.status(500).json({ success: false, error: 'Stream error', details: err.message });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
