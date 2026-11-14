import mongoose from 'mongoose';

const adminConfigSchema = new mongoose.Schema(
  {
    adminKeyHash: {
      type: String,
      required: true // Hashed master PIN/Passcode for /admin
    },
    allowedLocalSubnet: {
      type: String,
      default: '192.168.' // Optional: restrict admin to home Wi-Fi subnet
    },
    serverName: {
      type: String,
      default: 'Personal Home Media Hub'
    },
    googleDriveFolderId: {
      type: String,
      required: true // Target folder in Google Drive
    }
  },
  {
    timestamps: true
  }
);

export const AdminConfig = mongoose.model('AdminConfig', adminConfigSchema);
