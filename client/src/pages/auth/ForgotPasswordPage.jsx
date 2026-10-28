// FORGOT PASSWORD - Owner: Member 2 - Requirements: 11
// Route: /forgot-password   Access: guest   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// Step 1 of the reset flow: ask for the email, then send the user to /reset-password to enter the code.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestOtp } from '../../api/passwordReset.api';
import { getErrorMessage } from '../../api/axios';
import { isValidEmail } from '../../utils/validators';
import AuthFormLayout from '../../components/auth/AuthFormLayout';
import FormField from '../../components/common/FormField';
import Alert from '../../components/common/Alert';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault(); setError('');
    if (!isValidEmail(email)) { setError('Enter a valid email address'); return; }
    setBusy(true);
    try {
      const { message } = await requestOtp({ email });
      navigate('/reset-password', { state: { email, message } });
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }

  return <AuthFormLayout title="Forgot password">
    <p className="muted">Enter the email on your account and we'll send you a 6-digit reset code.</p>
    <Alert variant="error">{error}</Alert>
    <form onSubmit={submit} aria-busy={busy}>
      <FormField label="Email">
        <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset code'}</button>
    </form>
    <p>Already have a code? <Link to="/reset-password" state={{ email }}>Enter it here</Link></p>
    <p><Link to="/login">Back to login</Link></p>
  </AuthFormLayout>;
}
