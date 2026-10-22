const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'ShareShed <no-reply@shareshed.local>',
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB, 10) || 5,
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
};

env.assertRequired = () => {
  const missing = ['MONGO_URI', 'JWT_SECRET'].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars in server/.env: ${missing.join(', ')} (see server/.env.example)`);
  }
};

module.exports = env;
