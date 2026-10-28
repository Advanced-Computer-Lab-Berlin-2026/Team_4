// MY PROFILE - Owner: Member 2 - Requirements: 12
// Route: /account/profile   Access: member   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// Shows the member's details; phone and address are editable, the rest is read-only.
import { useState } from 'react';
import { updateProfile } from '../../api/account.api';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { isValidPhone } from '../../utils/validators';
import FormField from '../../components/common/FormField';
import Alert from '../../components/common/Alert';
import '../../components/account/account.css';

const ADDRESS_FIELDS = [
  ['street', 'Street address', 'street-address', true],
  ['city', 'City', 'address-level2', true],
  ['state', 'State (optional)', 'address-level1', false],
  ['postalCode', 'Postal code (optional)', 'postal-code', false],
  ['country', 'Country', 'country-name', true],
];

const fromUser = (user) => ({
  phone: user?.phone || '',
  ...Object.fromEntries(ADDRESS_FIELDS.map(([key]) => [key, user?.address?.[key] || ''])),
});

export default function ProfilePage() {
  // The logged-in user is already loaded by AuthContext (GET /api/auth/me), so no extra fetch is needed.
  const { user, setUser } = useAuth();
  const [values, setValues] = useState(() => fromUser(user));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (e) => setValues({ ...values, [e.target.name]: e.target.value });
  // Save is only enabled when the form differs from what is saved on the server.
  const saved = fromUser(user);
  const dirty = Object.keys(saved).some((key) => values[key] !== saved[key]);

  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess(''); setErrors({});
    if (!isValidPhone(values.phone)) { setErrors({ phone: 'Invalid phone number' }); return; }
    setBusy(true);
    try {
      const { phone, ...address } = values;
      const { user: updated } = await updateProfile({ phone, address });
      setUser(updated); // keep the navbar/context in sync with the saved data
      setValues(fromUser(updated));
      setSuccess('Profile updated');
    } catch (err) {
      setError(getErrorMessage(err));
      // server reports address errors as "address.city" etc.
      setErrors(Object.fromEntries(getFieldErrors(err).map(({ field, message }) => [field.replace(/^address\./, ''), message])));
    } finally { setBusy(false); }
  }

  return <div className="container"><section className="card form-card"><div className="card-body">
    <h1>My profile</h1>
    <dl className="readonly-list">
      <dt>Name</dt><dd>{user?.name}</dd>
      <dt>Username</dt><dd>{user?.username}</dd>
      <dt>Email</dt><dd>{user?.email}</dd>
    </dl>
    <Alert variant="error">{error}</Alert>
    <Alert variant="success">{success}</Alert>
    <form onSubmit={submit} aria-busy={busy}>
      <FormField label="Phone number" error={errors.phone}>
        <input name="phone" type="tel" autoComplete="tel" required value={values.phone} onChange={change} />
      </FormField>
      {ADDRESS_FIELDS.map(([key, label, autoComplete, required]) =>
        <FormField key={key} label={label} error={errors[key]}>
          <input name={key} type="text" autoComplete={autoComplete} required={required} value={values[key]} onChange={change} />
        </FormField>)}
      <button className="btn" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  </div></section></div>;
}
