// RESET PASSWORD - Owner: Member 2 - Requirements: 11
// Route: /reset-password   Access: guest   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// Step 2 of the reset flow: email (pre-filled from step 1) + emailed code + new password.
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { confirmReset, requestOtp } from '../../api/passwordReset.api';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { isValidPassword, PASSWORD_HINT } from '../../utils/validators';
import AuthFormLayout from '../../components/auth/AuthFormLayout';
import PasswordInput from '../../components/account/PasswordInput';
import FormField from '../../components/common/FormField';
import Alert from '../../components/common/Alert';

export default function ResetPasswordPage() {
  const location = useLocation();
  const [values, setValues] = useState({ email: location.state?.email || '', otp: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState(location.state?.message || '');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (e) => setValues({ ...values, [e.target.name]: e.target.value });

  async function submit(event) {
    event.preventDefault(); setError(''); setErrors({});
    if (!/^\d{6}$/.test(values.otp.trim())) { setErrors({ otp: 'The code is 6 digits' }); return; }
    if (!isValidPassword(values.newPassword)) { setErrors({ newPassword: PASSWORD_HINT }); return; }
    if (values.newPassword !== values.confirmPassword) { setErrors({ confirmPassword: 'Passwords do not match' }); return; }
    setBusy(true);
    try {
      const { message } = await confirmReset({ email: values.email, otp: values.otp.trim(), newPassword: values.newPassword });
      setDone(message);
    } catch (err) {
      setError(getErrorMessage(err));
      setErrors(Object.fromEntries(getFieldErrors(err).map(({ field, message }) => [field, message])));
    } finally { setBusy(false); }
  }

  async function resend() {
    setError(''); setInfo('');
    if (!values.email) { setErrors({ email: 'Enter your email first' }); return; }
    try { setInfo((await requestOtp({ email: values.email })).message); }
    catch (err) { setError(getErrorMessage(err)); }
  }

  if (done) {
    return <AuthFormLayout title="Password reset">
      <Alert variant="success">{done}</Alert>
      <Link className="btn" to="/login">Go to login</Link>
    </AuthFormLayout>;
  }

  return <AuthFormLayout title="Reset password">
    <Alert variant="info">{info}</Alert>
    <Alert variant="error">{error}</Alert>
    <form onSubmit={submit} aria-busy={busy}>
      <FormField label="Email" error={errors.email}>
        <input name="email" type="email" autoComplete="email" required value={values.email} onChange={change} />
      </FormField>
      <FormField label="Reset code" error={errors.otp} hint="The 6-digit code from the email we sent you.">
        <input name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
          value={values.otp} onChange={change} />
      </FormField>
      <PasswordInput name="newPassword" label="New password" showRules
        value={values.newPassword} onChange={change} error={errors.newPassword} />
      <PasswordInput name="confirmPassword" label="Confirm new password"
        value={values.confirmPassword} onChange={change} error={errors.confirmPassword} />
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
        <button type="button" className="btn-link" onClick={resend}>Resend code</button>
      </div>
    </form>
    <p><Link to="/login">Back to login</Link></p>
  </AuthFormLayout>;
}
