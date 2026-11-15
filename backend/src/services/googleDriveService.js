import { google } from 'googleapis';
import { Readable } from 'stream';
import { AdminConfig } from '../models/AdminConfig.js';

class GoogleDriveService {
  constructor() {
    this.driveFolder = 'LocalStreamHub';
  }

  async getConfig() {
    let config = await AdminConfig.findOne();
    if (!config) {
      config = await AdminConfig.create({
        activeStorageProvider: 'cloudinary'
      });
    }
    return config;
  }

  async getOAuth2Client(redirectUri) {
    const config = await this.getConfig();
    const clientId = process.env.GOOGLE_CLIENT_ID || config.googleClientId;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || config.googleClientSecret;

    if (!clientId || !clientSecret) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    if (config.googleTokens?.refresh_token || config.googleTokens?.access_token) {
      oauth2Client.setCredentials(config.googleTokens);

      oauth2Client.on('tokens', async (tokens) => {
        config.googleTokens = { ...config.googleTokens, ...tokens };
        await config.save();
      });
    }

    return oauth2Client;
  }

  async getAuthUrl(redirectUri) {
    const oauth2Client = await this.getOAuth2Client(redirectUri);
    if (!oauth2Client) {
      throw new Error('Google Client ID and Client Secret are not configured yet.');
    }

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes
    });
  }

  async handleCallback(code, redirectUri) {
    const config = await this.getConfig();
    const oauth2Client = await this.getOAuth2Client(redirectUri);
    if (!oauth2Client) throw new Error('OAuth2 client not initialized');

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    config.googleTokens = tokens;
    config.googleDriveConnected = true;
    config.googleUserEmail = userInfo.data.email || 'Connected Google Account';
    await config.save();

    return {
      email: config.googleUserEmail,
      connected: true
    };
  }

  async getDriveClient() {
    const config = await this.getConfig();
    if (!config.googleDriveConnected || !config.googleTokens?.access_token) {
      return null;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || config.googleClientId;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || config.googleClientSecret;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials(config.googleTokens);

    oauth2Client.on('tokens', async (tokens) => {
      config.googleTokens = { ...config.googleTokens, ...tokens };
      await config.save();
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  async getStorageQuota() {
    try {
      const drive = await this.getDriveClient();
      if (!drive) {
        return {
          connected: false,
          userEmail: null,
          totalBytes: 0,
          usedBytes: 0,
          remainingBytes: 0,
          usedPercent: 0,
          formattedUsed: '0 GB',
          formattedTotal: '0 GB',
          formattedRemaining: '0 GB'
        };
      }

      const about = await drive.about.get({ fields: 'storageQuota,user' });
      const quota = about.data.storageQuota;
      const user = about.data.user;

      const limit = parseInt(quota.limit || 16106127360, 10); // default 15GB if unlimited
      const usage = parseInt(quota.usage || 0, 10);
      const remaining = Math.max(0, limit - usage);
      const usedPercent = limit > 0 ? parseFloat(((usage / limit) * 100).toFixed(1)) : 0;

      const formatGB = (bytes) => `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;

      return {
        connected: true,
        userEmail: user?.emailAddress || 'Connected Account',
        displayName: user?.displayName,
        totalBytes: limit,
        usedBytes: usage,
        remainingBytes: remaining,
        usedPercent,
        formattedUsed: formatGB(usage),
        formattedTotal: formatGB(limit),
        formattedRemaining: formatGB(remaining)
      };
    } catch (err) {
      console.error('[Google Drive Storage Error]:', err.message);
      return {
        connected: false,
        error: err.message
      };
    }
  }

  async getOrCreateAppFolder(drive) {
    const config = await this.getConfig();
    if (config.googleDriveFolderId) {
      return config.googleDriveFolderId;
    }

    // Search for existing folder
    const res = await drive.files.list({
      q: `name = '${this.driveFolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)'
    });

    if (res.data.files && res.data.files.length > 0) {
      config.googleDriveFolderId = res.data.files[0].id;
      await config.save();
      return config.googleDriveFolderId;
    }

    // Create new folder
    const folderMetadata = {
      name: this.driveFolder,
      mimeType: 'application/vnd.google-apps.folder'
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    config.googleDriveFolderId = folder.data.id;
    await config.save();
    return config.googleDriveFolderId;
  }

  async uploadFile(fileBuffer, originalName, mimeType) {
    const drive = await this.getDriveClient();
    if (!drive) throw new Error('Google Drive is not connected');

    const folderId = await this.getOrCreateAppFolder(drive);

    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    const fileMetadata = {
      name: originalName,
      parents: [folderId]
    };

    const media = {
      mimeType,
      body: stream
    };

    const res = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id, name, webViewLink, webContentLink, size'
    });

    return {
      fileId: res.data.id,
      name: res.data.name,
      size: res.data.size || fileBuffer.length
    };
  }

  async streamFile(fileId, rangeHeader) {
    const drive = await this.getDriveClient();
    if (!drive) throw new Error('Google Drive is not connected');

    const options = {
      fileId,
      alt: 'media'
    };

    const headers = {};
    if (rangeHeader) {
      headers.Range = rangeHeader;
    }

    return await drive.files.get(options, {
      headers,
      responseType: 'stream'
    });
  }

  async deleteFile(fileId) {
    const drive = await this.getDriveClient();
    if (!drive) return;
    await drive.files.delete({ fileId });
  }

  async disconnect() {
    const config = await this.getConfig();
    config.googleDriveConnected = false;
    config.googleTokens = undefined;
    config.googleUserEmail = '';
    config.googleDriveFolderId = '';
    if (config.activeStorageProvider === 'google_drive') {
      config.activeStorageProvider = 'cloudinary';
    }
    await config.save();
  }
}

export const googleDriveService = new GoogleDriveService();
