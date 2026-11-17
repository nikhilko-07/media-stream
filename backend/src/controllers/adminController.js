import { Readable } from 'stream';
import fs from 'fs';
import os from 'os';
import jwt from 'jsonwebtoken';
import { cloudinary } from '../config/cloudinary.js';
import { Media } from '../models/Media.js';
import { DeviceSession } from '../models/DeviceSession.js';
import { AdminConfig } from '../models/AdminConfig.js';
import { tunnelService } from '../services/tunnelService.js';
import { googleDriveService } from '../services/googleDriveService.js';

let localSharingCache = true;

export const isLocalSharingActive = () => localSharingCache;

export const initLocalSharingState = async () => {
  try {
    const config = await AdminConfig.findOne();
    if (config && typeof config.localNetworkSharing === 'boolean') {
      localSharingCache = config.localNetworkSharing;
    }
  } catch (e) {}
};

// Toggle Local Network Sharing (Disconnect / Reconnect)
export const toggleLocalNetwork = (io) => async (req, res) => {
  try {
    const { enabled } = req.body || {};
    const newState = typeof enabled === 'boolean' ? enabled : !localSharingCache;

    localSharingCache = newState;

    let config = await AdminConfig.findOne();
    if (!config) {
      config = await AdminConfig.create({ localNetworkSharing: newState });
    } else {
      config.localNetworkSharing = newState;
      await config.save();
    }

    // Real-time broadcast to local clients
    if (io) {
      io.emit('LOCAL_NETWORK_STATE_CHANGED', {
        connected: newState,
        message: newState
          ? 'Local Wi-Fi Network Connected.'
          : 'Local Wi-Fi Network Disconnected by Administrator.'
      });
    }

    res.json({
      success: true,
      message: newState ? 'Local Wi-Fi Network Connected' : 'Local Wi-Fi Network Disconnected',
      localNetworkSharing: newState
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Storage Overview (Remaining Space in Cloudinary & Google Drive)
export const getStorageOverview = async (req, res) => {
  try {
    const config = await googleDriveService.getConfig();

    // 1. Fetch Cloudinary stats
    let cloudinaryStats = {
      connected: true,
      plan: 'Free',
      storageUsedBytes: 0,
      storageLimitBytes: 26843545600, // 25 GB default
      formattedUsed: '0 MB',
      formattedLimit: '25 GB',
      formattedRemaining: '25 GB',
      usedPercent: 0
    };

    try {
      const usage = await cloudinary.api.usage();
      const usedBytes = usage.storage?.usage || 0;
      const limitBytes = (usage.credits?.limit || 25) * 1024 * 1024 * 1024;
      const remainingBytes = Math.max(0, limitBytes - usedBytes);
      const usedPercent = limitBytes > 0 ? parseFloat(((usedBytes / limitBytes) * 100).toFixed(1)) : 0;

      cloudinaryStats = {
        connected: true,
        plan: usage.plan || 'Free',
        storageUsedBytes: usedBytes,
        storageLimitBytes: limitBytes,
        formattedUsed: `${(usedBytes / (1024 * 1024)).toFixed(1)} MB`,
        formattedLimit: `${(limitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
        formattedRemaining: `${(remainingBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        usedPercent
      };
    } catch (cErr) {
      console.warn('[Cloudinary Usage Warning]:', cErr.message);
    }

    // 2. Fetch Google Drive stats
    const driveStats = await googleDriveService.getStorageQuota();

    res.json({
      success: true,
      data: {
        activeStorageProvider: config.activeStorageProvider || 'cloudinary',
        googleClientIdConfigured: !!(process.env.GOOGLE_CLIENT_ID || config.googleClientId),
        cloudinary: cloudinaryStats,
        googleDrive: driveStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Switch Active Storage Provider ('cloudinary' vs 'google_drive')
export const setActiveStorageProvider = async (req, res) => {
  try {
    const { provider } = req.body;
    if (!['cloudinary', 'google_drive'].includes(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }

    const config = await googleDriveService.getConfig();
    if (provider === 'google_drive' && !config.googleDriveConnected) {
      return res.status(400).json({
        success: false,
        error: 'Please connect Google Drive first before selecting it as active storage.'
      });
    }

    config.activeStorageProvider = provider;
    await config.save();

    res.json({
      success: true,
      message: `Active storage switched to ${provider === 'google_drive' ? 'Google Drive' : 'Cloudinary'}!`,
      activeStorageProvider: provider
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Save Google API Credentials (Client ID & Secret)
export const saveGoogleCredentials = async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body;
    const config = await googleDriveService.getConfig();
    if (clientId) config.googleClientId = clientId.trim();
    if (clientSecret) config.googleClientSecret = clientSecret.trim();
    await config.save();
    res.json({ success: true, message: 'Google Client credentials saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate Google OAuth2 URL
export const getGoogleAuthUrl = async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/v1/admin/google/callback`;

    const url = await googleDriveService.getAuthUrl(redirectUri);
    res.json({ success: true, url, redirectUri });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Google OAuth2 Callback
export const handleGoogleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/v1/admin/google/callback`;

    if (!code) {
      return res.redirect('/admin?google_error=Missing_Auth_Code');
    }

    await googleDriveService.handleCallback(code, redirectUri);
    res.redirect('/admin?google_connected=true');
  } catch (error) {
    console.error('[Google Callback Error]:', error);
    res.redirect(`/admin?google_error=${encodeURIComponent(error.message)}`);
  }
};

// Disconnect Google Drive
export const disconnectGoogleDrive = async (req, res) => {
  try {
    await googleDriveService.disconnect();
    res.json({ success: true, message: 'Google Drive disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

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
        activeInterfaces: activeIps,
        localNetworkSharing: localSharingCache
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

// Upload Video, Audio, or Image to Google Drive or Cloudinary & Save in MongoDB
export const uploadMedia = async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { title, description } = req.body;
    const file = req.file;

    // Detect mediaType with full MKV, MP4, WebM, AVI, MOV, Audio, Image support
    const isMkv = file.originalname.toLowerCase().endsWith('.mkv') || file.mimetype.includes('matroska');
    let mediaType = 'image';
    let resourceType = 'image';

    if (file.mimetype.startsWith('video/') || isMkv || file.originalname.match(/\.(mp4|mkv|webm|avi|mov|flv|wmv|3gp|ts)$/i)) {
      mediaType = 'video';
      resourceType = 'video';
    } else if (file.mimetype.startsWith('audio/') || file.originalname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
      mediaType = 'audio';
      resourceType = 'video'; // Cloudinary treats audio under 'video' resource_type
    }

    const mimeType = isMkv ? 'video/x-matroska' : (file.mimetype || 'application/octet-stream');

    // Check active storage provider
    const config = await googleDriveService.getConfig();
    const activeProvider = config.activeStorageProvider || 'cloudinary';

    if (activeProvider === 'google_drive') {
      if (!config.googleDriveConnected) {
        return res.status(400).json({
          success: false,
          error: 'Google Drive is selected as active storage, but is not connected yet. Please connect your Google Drive first in the Storage Hub above.'
        });
      }

      const driveResult = await googleDriveService.uploadFileFromDisk(filePath, file.originalname, mimeType);

      const newMedia = await Media.create({
        title: title || file.originalname,
        description: description || '',
        mediaType,
        mimeType,
        fileSize: file.size,
        storageProvider: 'google_drive',
        googleDriveFileId: driveResult.fileId,
        secureUrl: driveResult.fileId,
        thumbnailUrl: '',
        durationSeconds: 0
      });

      return res.status(201).json({
        success: true,
        message: `${mediaType.toUpperCase()} uploaded to Google Drive successfully!`,
        data: newMedia
      });
    }

    // Default: Cloudinary Upload (streaming from disk in chunks)
    let cloudResult;
    try {
      cloudResult = await cloudinary.uploader.upload_large(filePath, {
        folder: 'local_stream_hub',
        resource_type: resourceType,
        public_id: `${mediaType}_${Date.now()}`,
        chunk_size: 20 * 1024 * 1024 // 20MB chunks
      });
    } catch (cErr) {
      if (file.size > 100 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: `File size is ${(file.size / (1024 * 1024 * 1024)).toFixed(1)} GB. Cloudinary free tier does not support video files over 100 MB. To upload large files (like this 3 GB file), please switch your storage provider to Google Drive in the dashboard (Google Drive provides 15 GB+ for free)!`
        });
      }
      throw cErr;
    }

    // Auto-generate video thumbnail or image preview (works for MKV and MP4)
    let thumbnailUrl = cloudResult.secure_url;
    if (mediaType === 'video') {
      thumbnailUrl = cloudinary.url(cloudResult.public_id, {
        resource_type: 'video',
        format: 'jpg',
        transformation: [{ so: 1 }, { width: 480, crop: 'scale' }]
      });
    }

    const newMedia = await Media.create({
      title: title || file.originalname,
      description: description || '',
      mediaType,
      mimeType,
      fileSize: file.size,
      storageProvider: 'cloudinary',
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
      message: `${mediaType.toUpperCase()} uploaded to Cloudinary successfully!`,
      data: newMedia
    });
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({ success: false, error: 'Upload failed', details: error.message });
  } finally {
    // Delete temporary disk file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to unlink temporary file:', e);
      }
    }
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

    if (media.storageProvider === 'google_drive') {
      await googleDriveService.deleteFile(media.googleDriveFileId);
    } else {
      const resourceType = media.mediaType === 'image' ? 'image' : 'video';
      if (media.cloudinaryPublicId) {
        await cloudinary.uploader.destroy(media.cloudinaryPublicId, { resource_type: resourceType });
      }
    }
    await Media.findByIdAndDelete(id);

    res.json({ success: true, message: 'Media deleted from storage and database' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create Google Drive Resumable Upload Session URL for Direct Client Upload
export const createGoogleUploadSession = async (req, res) => {
  try {
    const { fileName, fileSize, mimeType } = req.body;
    if (!fileName) {
      return res.status(400).json({ success: false, error: 'File name is required' });
    }

    const config = await googleDriveService.getConfig();
    if (!config.googleDriveConnected) {
      return res.status(400).json({
        success: false,
        error: 'Google Drive is not connected yet.'
      });
    }

    // Determine client origin for CORS header
    let origin = req.headers.origin;
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch (e) {}
    }

    const { uploadUrl, folderId } = await googleDriveService.createResumableUploadSession({
      fileName,
      fileSize,
      mimeType,
      origin
    });

    res.json({
      success: true,
      uploadUrl,
      folderId
    });
  } catch (error) {
    console.error('Create Google upload session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Complete Google Drive Upload & Register Media in Database
export const completeGoogleUpload = async (req, res) => {
  try {
    const { fileId, title, description, fileName, fileSize, mimeType } = req.body;
    if (!fileId) {
      return res.status(400).json({ success: false, error: 'Google Drive file ID is required' });
    }

    const drive = await googleDriveService.getDriveClient();
    if (!drive) {
      return res.status(400).json({ success: false, error: 'Google Drive is not connected' });
    }

    // Fetch verified file details from Google Drive
    const driveFile = await drive.files.get({
      fileId,
      fields: 'id, name, size, mimeType'
    });

    const actualName = driveFile.data.name || fileName || 'Uploaded File';
    const actualSize = parseInt(driveFile.data.size || fileSize || 0, 10);
    const actualMime = driveFile.data.mimeType || mimeType || 'application/octet-stream';

    const isMkv = actualName.toLowerCase().endsWith('.mkv') || actualMime.includes('matroska');
    let mediaType = 'image';

    if (actualMime.startsWith('video/') || isMkv || actualName.match(/\.(mp4|mkv|webm|avi|mov|flv|wmv|3gp|ts)$/i)) {
      mediaType = 'video';
    } else if (actualMime.startsWith('audio/') || actualName.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
      mediaType = 'audio';
    }

    const newMedia = await Media.create({
      title: title || actualName,
      description: description || '',
      mediaType,
      mimeType: actualMime,
      fileSize: actualSize,
      storageProvider: 'google_drive',
      googleDriveFileId: fileId,
      secureUrl: fileId,
      thumbnailUrl: '',
      durationSeconds: 0
    });

    res.status(201).json({
      success: true,
      message: `${mediaType.toUpperCase()} successfully saved to Google Drive!`,
      data: newMedia
    });
  } catch (error) {
    console.error('Complete Google upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
