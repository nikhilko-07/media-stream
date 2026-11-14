import mongoose from 'mongoose';

const streamSessionSchema = new mongoose.Schema(
  {
    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Media',
      required: true
    },
    deviceSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeviceSession',
      required: true
    },
    clientIp: {
      type: String,
      required: true
    },
    streamToken: {
      type: String,
      required: true
    },
    // Ephemeral: Auto-expires after 60 seconds
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60
    }
  }
);

export const StreamSession = mongoose.model('StreamSession', streamSessionSchema);
