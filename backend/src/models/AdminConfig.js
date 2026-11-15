import mongoose from 'mongoose';

const adminConfigSchema = new mongoose.Schema(
  {
    serverName: {
      type: String,
      default: 'Personal Home Media Hub'
    },
    // Active Storage Provider: 'cloudinary' or 'google_drive'
    activeStorageProvider: {
      type: String,
      enum: ['cloudinary', 'google_drive'],
      default: 'cloudinary'
    },
    // Google Drive Integration Details
    googleDriveConnected: {
      type: Boolean,
      default: false
    },
    googleClientId: {
      type: String,
      default: ''
    },
    googleClientSecret: {
      type: String,
      default: ''
    },
    googleTokens: {
      access_token: String,
      refresh_token: String,
      scope: String,
      token_type: String,
      expiry_date: Number
    },
    googleUserEmail: {
      type: String,
      default: ''
    },
    googleDriveFolderId: {
      type: String,
      default: ''
    },
    // Local Wi-Fi Network Access Toggle (Enabled by default, can be disconnected)
    localNetworkSharing: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export const AdminConfig = mongoose.model('AdminConfig', adminConfigSchema);
