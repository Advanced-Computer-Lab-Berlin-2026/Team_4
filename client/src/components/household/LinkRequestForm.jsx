// LinkRequestForm - Owner: Member 8 - Requirements: 24
// Props: { onSent } — email/phone + relation form
import { useState } from 'react';
import Alert from '../common/Alert';
import useFeedback from '../feedback/useFeedback';
import { sendRequest } from '../../api/household.api';
import { getErrorMessage } from '../../api/axios';
import { isValidEmail } from '../../utils/validators';
import FormField from '../common/FormField';

const RELATIONS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
];

export default function LinkRequestForm({ onSent }) {
  const { toast } = useFeedback();
  const [contact, setContact] = useState('');
  const [relation, setRelation] = useState('spouse');
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validateForm = () => {
    const errs = {};
    const trimmed = contact.trim();

    if (!trimmed) {
      errs.contact = 'Enter your household member’s email or phone number.';
    } else if (trimmed.includes('@')) {
      if (!isValidEmail(trimmed)) {
        errs.contact = 'Enter a valid email address.';
      }
    } else if (/^[+\d\s-]+$/.test(trimmed)) {
      if (!/^\+?\d{7,15}$/.test(trimmed.replace(/[\s-]/g, ''))) {
        errs.contact = 'Enter a valid phone number (7–15 digits).';
      }
    } else {
      errs.contact = 'Enter a valid email address or phone number.';
    }

    if (!RELATIONS.some((r) => r.value === relation)) {
      errs.relation = 'Select a valid family relation.';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validateForm()) return;

    const trimmed = contact.trim();
    const payload = {
      relation,
      ...(trimmed.includes('@')
        ? { email: trimmed.toLowerCase() }
        : { phone: trimmed.replace(/[\s-]/g, '') }),
    };

    try {
      setSubmitting(true);
      const res = await sendRequest(payload);
      toast(res.message || 'Household link request sent.');
      setContact('');
      setRelation('spouse');
      setFieldErrors({});
      if (onSent) onSent(res.link);
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="card">
      <div className="card-body">
        <h2>Link a household member</h2>
        <p className="muted">
          Send a request to a spouse, child, or parent living at the same home address.
          Once accepted, you share the best available deposit discount and waitlist priority.
          Reservation limits, wallets and logins stay separate.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label="Member email or phone number"
            error={fieldErrors.contact}
            hint="They must already have a ShareShed member account at your address."
          >
            <input
              type="text"
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                if (fieldErrors.contact) setFieldErrors((prev) => ({ ...prev, contact: '' }));
              }}
              placeholder="e.g. member2@shareshed.local or +201000000003"
              autoComplete="off"
              disabled={submitting}
            />
          </FormField>

          <FormField
            label="Their relation to you"
            error={fieldErrors.relation}
            hint="Limited to immediate household relations (spouse, child, or parent)."
          >
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              disabled={submitting}
            >
              {RELATIONS.map((rel) => (
                <option key={rel.value} value={rel.value}>
                  {rel.label}
                </option>
              ))}
            </select>
          </FormField>

          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </form>

        <Alert variant="error">{serverError}</Alert>
      </div>
    </article>
  );
}
