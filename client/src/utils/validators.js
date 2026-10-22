// FOUNDATION - client-side validation. MUST mirror server/src/config/constants.js (the server is the real check).
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_HINT =
  'At least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.';

export const passwordChecks = (pw = '') => [
  { label: 'At least 8 characters', ok: pw.length >= 8 },
  { label: 'An uppercase letter', ok: /[A-Z]/.test(pw) },
  { label: 'A lowercase letter', ok: /[a-z]/.test(pw) },
  { label: 'A number', ok: /\d/.test(pw) },
  { label: 'A special character', ok: /[^A-Za-z0-9]/.test(pw) },
];

export const isValidPassword = (pw) => PASSWORD_REGEX.test(pw || '');
export const isValidEmail = (v) => /^\S+@\S+\.\S+$/.test(v || '');
export const isValidPhone = (v) => /^\+?[0-9\s-]{7,15}$/.test(v || '');

export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_UPLOAD_MB = 5;
