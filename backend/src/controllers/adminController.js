import { Readable } from 'stream';
import os from 'os';
import jwt from 'jsonwebtoken';
import { cloudinary } from '../config/cloudinary.js';
import { Media } from '../models/Media.js';
import { DeviceSession } from '../models/DeviceSession.js';
import { tunnelService } from '../services/tunnelService.js';

// Tunnel Management
export const getTunnelStatus = (req, res) => {
  res.json({ success: true, data: tunnelService.getStatus() });
};

// Generate Instant Pre-Approved One-Click Fast Link
export const generateQuickAccessLink = async (req, res) => {
  try {
    const { networkType } = req.body || {}; // 'wifi' | 'mdns' | 'domain'

    // Create pre-approved device session
    const session = await DeviceSession.create({
      pairingCode: 'DIRECT-PASS',
      deviceName: 'One-Click Instant Pass',
      ipAddress: req.ip,
      status: 'APPROVED',
      approvedAt: new Date()
    });

    const secret = process.env.DEVICE_JWT_SECRET || 'device_jwt_secret_key_1234';
    const deviceAccessToken = jwt.sign(
      { sessionId: session._id, ip: session.ipAddress },
      secret,
      { expiresIn: '7d' } // Valid for 7 days
    );

    session.deviceAccessToken = deviceAccessToken;
    await session.save();

    // Determine host
    const port = process.env.PORT || 9086;
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
    }

    const rawHostname = os.hostname();
    const hostname = rawHostname.endsWith('.local') ? rawHostname : `${rawHostname}.local`;
    const customDomain = process.env.CUSTOM_DOMAIN || 'https://stream.nikhilkohli.com';

    let baseUrl = `http://${localIp}:${port}`;
    if (networkType === 'mdns') baseUrl = `http://${hostname}:${port}`;
    if (networkType === 'domain') baseUrl = customDomain;

    const accessUrl = `${baseUrl}/?token=${deviceAccessToken}`;

    res.json({
      success: true,
      data: {
        accessUrl,
        deviceAccessToken,
        expiresIn: '7 Days',
        networkType: networkType || 'wifi'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const startTunnel = async (req, res) => {
  try {
    const port = process.env.PORT || 9086;
    const data = await tunnelService.startTunnel(port);
    res.json({ success: true, message: 'Online tunnel activated', data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to start tunnel', details: error.message });
  }
};

export const stopTunnel = async (req, res) => {
  try {
    const data = await tunnelService.stopTunnel();
    res.json({ success: true, message: 'Online tunnel deactivated', data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Network Info (Wi-Fi IP, mDNS Hostname, Interfaces)
export const getNetworkInfo = (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const activeIps = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          activeIps.push({
            interface: name,
            ip: iface.address,
            netmask: iface.netmask
          });
        }
      }
    }

    const primaryIp = activeIps[0]?.ip || 'localhost';
    const rawHostname = os.hostname();
    const hostname = rawHostname.endsWith('.local') ? rawHostname : `${rawHostname}.local`;
    const port = process.env.PORT || 9086;

    res.json({
      success: true,
      data: {
        primaryIp,
        port,
        hostname,
        directWifiUrl: `http://${primaryIp}:${port}`,
        mdnsUrl: `http://${hostname}:${port}`,
        activeInterfaces: activeIps
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Verify Admin Key
export const verifyAdmin = (req, res) => {
  res.json({
    success: true,
    message: 'Admin authenticated successfully'
  });
};

// List Pending Devices waiting to be admitted
export const listPendingDevices = async (req, res) => {
  try {
    const pendingDevices = await DeviceSession.find({ status: 'PENDING' }).sort({ createdAt: -1 });
    res.json({ success: true, count: pendingDevices.length, data: pendingDevices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Approve Device Code & Emit Socket Notification
export const approveDevice = (io) => async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'Pairing code is required' });
    }

    const session = await DeviceSession.findOne({ pairingCode: code.trim(), status: 'PENDING' });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Pairing code not found or expired' });
    }

    // Generate 30-day device access token
    const secret = process.env.DEVICE_JWT_SECRET || 'device_jwt_secret_key_1234';
    const deviceAccessToken = jwt.sign(
      { sessionId: session._id, ip: session.ipAddress },
      secret,
      { expiresIn: '30d' }
    );

    session.status = 'APPROVED';
    session.deviceAccessToken = deviceAccessToken;
    session.approvedAt = new Date();
    await session.save();

    // Notify waiting device in real-time
    io.to(`pair_${code.trim()}`).emit('PAIRING_APPROVED', {
      deviceAccessToken,
      deviceName: session.deviceName
    });

    res.json({
      success: true,
      message: `Device '${session.deviceName}' successfully admitted!`,
      data: session
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// List Admitted / Active Devices
export const listActiveDevices = async (req, res) => {
  try {
    const activeDevices = await DeviceSession.find({ status: 'APPROVED' }).sort({ approvedAt: -1 });
    res.json({ success: true, count: activeDevices.length, data: activeDevices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Revoke Device
export const revokeDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await DeviceSession.findByIdAndUpdate(id, { status: 'REVOKED' }, { new: true });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Device session not found' });
    }
    res.json({ success: true, message: 'Device access revoked successfully', data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Upload Video, Audio, or Image to Cloudinary & Save in MongoDB
export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { title, description } = req.body;
    const file = req.file;

    // Detect mediaType with full MKV, MP4, WebM, Audio, Image support
    const isMkv = file.originalname.toLowerCase().endsWith('.mkv') || file.mimetype.includes('matroska');
    let mediaType = 'image';
    let resourceType = 'image';

    if (file.mimetype.startsWith('video/') || isMkv) {
      mediaType = 'video';
      resourceType = 'video';
    } else if (file.mimetype.startsWith('audio/')) {
      mediaType = 'audio';
      resourceType = 'video'; // Cloudinary treats audio under 'video' resource_type
    }

    // Stream upload directly from memory to Cloudinary
    const uploadStream = () =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'local_stream_hub',
            resource_type: resourceType,
            public_id: `${mediaType}_${Date.now()}`
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );

        const readableStream = new Readable();
        readableStream.push(file.buffer);
        readableStream.push(null);
        readableStream.pipe(stream);
      });

    const cloudResult = await uploadStream();

    // Auto-generate video thumbnail or image preview (works for MKV and MP4)
    let thumbnailUrl = cloudResult.secure_url;
    if (mediaType === 'video') {
      thumbnailUrl = cloudinary.url(cloudResult.public_id, {
        resource_type: 'video',
        format: 'jpg',
        transformation: [{ so: 1 }, { width: 480, crop: 'scale' }]
      });
    }

    const mimeType = isMkv ? 'video/x-matroska' : file.mimetype;

    const newMedia = await Media.create({
      title: title || file.originalname,
      description: description || '',
      mediaType,
      mimeType,
      fileSize: file.size,
      cloudinaryPublicId: cloudResult.public_id,
      secureUrl: cloudResult.secure_url,
      thumbnailUrl,
      durationSeconds: cloudResult.duration || 0,
      dimensions: {
        width: cloudResult.width || 0,
        height: cloudResult.height || 0
      }
    });

    res.status(201).json({
      success: true,
      message: `${mediaType.toUpperCase()} uploaded successfully!`,
      data: newMedia
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Upload failed', details: error.message });
  }
};

// Admin List All Media
export const listAllMedia = async (req, res) => {
  try {
    const media = await Media.find().sort({ createdAt: -1 });
    res.json({ success: true, count: media.length, data: media });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Admin Delete Media from Cloudinary and DB
export const deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    const resourceType = media.mediaType === 'image' ? 'image' : 'video';
    await cloudinary.uploader.destroy(media.cloudinaryPublicId, { resource_type: resourceType });
    await Media.findByIdAndDelete(id);

    res.json({ success: true, message: 'Media deleted from Cloudinary and database' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
