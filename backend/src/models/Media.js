import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    mediaType: {
      type: String,
      required: true,
      enum: ['video', 'audio', 'image']
    },
    mimeType: {
      type: String,
      required: true // e.g. 'video/mp4', 'audio/mpeg', 'image/jpeg', 'video/x-matroska'
    },
    fileSize: {
      type: Number,
      required: true // Size in bytes
    },
    // Storage Provider Selector
    storageProvider: {
      type: String,
      enum: ['cloudinary', 'google_drive'],
      default: 'cloudinary'
    },
    // Cloudinary details (if stored on Cloudinary)
    cloudinaryPublicId: {
      type: String
    },
    secureUrl: {
      type: String
    },
    // Google Drive details (if stored on Google Drive)
    googleDriveFileId: {
      type: String
    },
    thumbnailUrl: {
      type: String,
      default: ''
    },
    durationSeconds: {
      type: Number,
      default: 0
    },
    dimensions: {
      width: { type: Number },
      height: { type: Number }
    }
  },
  {
    timestamps: true
  }
);

export const Media = mongoose.model('Media', mediaSchema);
