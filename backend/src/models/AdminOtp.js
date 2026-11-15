import mongoose from 'mongoose';

const adminOtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  // Automatically expires and deletes from MongoDB after 10 minutes (600s)
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600
  }
});

export const AdminOtp = mongoose.model('AdminOtp', adminOtpSchema);
