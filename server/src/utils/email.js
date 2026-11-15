const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
if (env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

async function sendEmail({ to, subject, text, html }) {
  if (!transporter) {
    throw new Error('SMTP is not configured; email delivery is unavailable');
  }
  return transporter.sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
}

module.exports = { sendEmail };
