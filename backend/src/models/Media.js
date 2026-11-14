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
      required: true // e.g. 'video/mp4', 'audio/mpeg', 'image/jpeg'
    },
    fileSize: {
      type: Number,
      required: true // Size in bytes
    },
    // Cloudinary Storage details
    cloudinaryPublicId: {
      type: String,
      required: true
    },
    secureUrl: {
      type: String,
      required: true
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
