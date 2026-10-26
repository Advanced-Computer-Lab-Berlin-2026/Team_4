import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../api/auth.api';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { isValidPassword, PASSWORD_HINT } from '../../utils/validators';
import AuthFormLayout from '../../components/auth/AuthFormLayout';
import CredentialsFields from '../../components/auth/CredentialsFields';
import FormField from '../../components/common/FormField';
import Alert from '../../components/common/Alert';

export default function RegisterPage() {
  const [values, setValues] = useState({ username: '', password: '', name: '', email: '', phone: '', street: '', city: '', state: '', postalCode: '', country: 'Egypt' });
  const [lend, setLend] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const change = (e) => setValues({ ...values, [e.target.name]: e.target.value });
  async function submit(event) {
    event.preventDefault(); setError(''); setErrors({});
    if (!isValidPassword(values.password)) { setErrors({ password: PASSWORD_HINT }); return; }
    setBusy(true);
    try {
      const { username, password, name, email, phone, street, city, state, postalCode, country } = values;
      const { user } = await register({ username, password, name, email, phone, address: { street, city, state, postalCode, country } });
      setUser(user);
      navigate(lend ? '/lender/apply' : '/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setErrors(Object.fromEntries(getFieldErrors(err).map(({ field, message }) => [field, message])));
    } finally { setBusy(false); }
  }
  return <AuthFormLayout title="Join ShareShed">
    <p className="muted">Create your account to start sharing with your neighbours.</p>
    <Alert variant="error">{error}</Alert>
    <form onSubmit={submit} aria-busy={busy}>
      <CredentialsFields values={values} onChange={change} errors={errors} newPassword />
      {[['name', 'Full name', 'text', 'name'], ['email', 'Email', 'email', 'email'], ['phone', 'Phone number', 'tel', 'tel'],
        ['street', 'Street address', 'text', 'street-address'], ['city', 'City', 'text', 'address-level2'],
        ['state', 'State (optional)', 'text', 'address-level1'], ['postalCode', 'Postal code (optional)', 'text', 'postal-code'],
        ['country', 'Country', 'text', 'country-name']].map(([key, label, type, autoComplete]) =>
        <FormField key={key} label={label} error={errors[key] || errors[`address.${key}`]}>
          <input name={key} type={type} autoComplete={autoComplete} value={values[key]} onChange={change}
            required={!['state', 'postalCode'].includes(key)} maxLength={key === 'name' ? 100 : undefined} />
        </FormField>)}
      <p><label><input type="checkbox" checked={lend} onChange={(e) => setLend(e.target.checked)} /> I also want to lend</label></p>
      <button className="btn" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
    <p>Already a member? <Link to="/login">Login</Link></p>
  </AuthFormLayout>;
}
