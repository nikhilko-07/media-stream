import mongoose from 'mongoose';

const deviceSessionSchema = new mongoose.Schema(
  {
    pairingCode: {
      type: String,
      required: true,
      index: true // e.g. "739-204"
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REVOKED', 'EXPIRED'],
      default: 'PENDING'
    },
    deviceAccessToken: {
      type: String,
      index: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    userAgent: {
      type: String,
      default: 'Unknown Device'
    },
    approvedAt: {
      type: Date
    },
    // Auto-expire unapproved codes after 10 minutes (600 seconds)
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600
    }
  }
);

export const DeviceSession = mongoose.model('DeviceSession', deviceSessionSchema);
