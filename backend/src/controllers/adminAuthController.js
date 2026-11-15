import jwt from 'jsonwebtoken';
import { AdminOtp } from '../models/AdminOtp.js';
import { sendAdminOtpEmail } from '../services/emailService.js';

const getVerifyEmail = () => {
  return process.env.VERIFY_MAIL || process.env.ADMIN_EMAIL || 'nikhilkohli2407@gmail.com';
};

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return 'admin@gmail.com';
  const [user, domain] = email.split('@');
  if (user.length <= 3) {
    return `${user[0]}***@${domain}`;
  }
  return `${user.slice(0, 3)}***${user.slice(-1)}@${domain}`;
};

// 1. Get Masked Email for Display
export const getAdminAuthInfo = (req, res) => {
  const email = getVerifyEmail();
  res.json({
    success: true,
    maskedEmail: maskEmail(email)
  });
};

// 2. Generate and Send OTP
export const sendAdminLoginOtp = async (req, res) => {
  try {
    const email = getVerifyEmail();

    // Generate random 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Clean up any existing OTP for this email
    await AdminOtp.deleteMany({ email });

    // Save new OTP (expires in 10 minutes via TTL index)
    await AdminOtp.create({
      email,
      otp
    });

    // Send email via Vercel nodemailer service
    await sendAdminOtpEmail(email, otp);

    console.log(`[Admin Security] OTP sent to ${maskEmail(email)}`);

    res.json({
      success: true,
      message: `OTP sent successfully to ${maskEmail(email)}`,
      maskedEmail: maskEmail(email),
      expiresInSeconds: 600
    });
  } catch (error) {
    console.error('[Send OTP Error]:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to send OTP email',
      details: error.message
    });
  }
};

// 3. Verify OTP and Issue 24-Hour Token
export const verifyAdminLoginOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const email = getVerifyEmail();

    if (!otp) {
      return res.status(400).json({ success: false, error: 'OTP is required' });
    }

    const record = await AdminOtp.findOne({ email, otp: otp.trim() });
    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP. Please check your email or request a new code.'
      });
    }

    // Delete used OTP
    await AdminOtp.deleteMany({ email });

    // Issue 24-hour signed JWT
    const jwtSecret = process.env.JWT_ADMIN_SECRET || process.env.ADMIN_SECRET_KEY || 'admin_jwt_secret_2026';
    const token = jwt.sign(
      { role: 'admin', email },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Admin authenticated successfully. Session valid for 24 hours.',
      token,
      expiresIn: '24h',
      expiresInSeconds: 86400
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
