const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
if (env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

/**
 * sendEmail({ to, subject, text, html })
 * With no SMTP configured (typical in dev) the email is printed to the server console,
 * so you can read OTP codes without any mail setup.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!transporter) {
    console.log(`\n[email:dev-console] To: ${to}\nSubject: ${subject}\n${text || html}\n`);
    return { dev: true };
  }
  return transporter.sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
}

module.exports = { sendEmail };
