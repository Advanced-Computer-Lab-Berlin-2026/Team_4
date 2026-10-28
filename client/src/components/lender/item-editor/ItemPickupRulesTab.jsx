// ItemPickupRulesTab - Owner: Member 6 - Requirements: 30, 31
// Props: { item, onSaved } - pickup location/instructions + borrowing rules
import { useEffect, useState } from 'react';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { setPickup, setRules } from '../../../api/itemPolicies.api';
import Alert from '../../common/Alert';
import FormField from '../../common/FormField';

const fieldErrorMap = (err) =>
  Object.fromEntries(getFieldErrors(err).map((fieldError) => [fieldError.field, fieldError.message]));

export default function ItemPickupRulesTab({ item, onSaved }) {
  const [pickup, setPickupForm] = useState({ location: '', instructions: '' });
  const [rules, setRulesForm] = useState({ maxBorrowDays: '', minTrustScore: 0 });
  const [pickupError, setPickupError] = useState('');
  const [rulesError, setRulesError] = useState('');
  const [pickupFields, setPickupFields] = useState({});
  const [rulesFields, setRulesFields] = useState({});
  const [pickupSuccess, setPickupSuccess] = useState('');
  const [rulesSuccess, setRulesSuccess] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    setPickupForm({
      location: item?.pickup?.location || '',
      instructions: item?.pickup?.instructions || '',
    });
    setRulesForm({
      maxBorrowDays: item?.rules?.maxBorrowDays || '',
      minTrustScore: item?.rules?.minTrustScore ?? 0,
    });
    setPickupError('');
    setRulesError('');
    setPickupFields({});
    setRulesFields({});
    setPickupSuccess('');
    setRulesSuccess('');
  }, [item]);

  if (!item?._id) return <Alert variant="info">Save the item details before setting pickup and borrowing rules.</Alert>;

  const savePickup = async (event) => {
    event.preventDefault();
    setSaving('pickup');
    setPickupError('');
    setPickupFields({});
    setPickupSuccess('');
    try {
      const data = await setPickup(item._id, pickup);
      onSaved?.(data.item);
      setPickupSuccess('Pickup details saved.');
    } catch (err) {
      setPickupError(getErrorMessage(err));
      setPickupFields(fieldErrorMap(err));
    } finally {
      setSaving('');
    }
  };

  const saveRules = async (event) => {
    event.preventDefault();
    setSaving('rules');
    setRulesError('');
    setRulesFields({});
    setRulesSuccess('');
    try {
      const payload = {
        maxBorrowDays: rules.maxBorrowDays === '' ? undefined : Number(rules.maxBorrowDays),
        minTrustScore: Number(rules.minTrustScore || 0),
      };
      const data = await setRules(item._id, payload);
      onSaved?.(data.item);
      setRulesSuccess('Borrowing rules saved.');
    } catch (err) {
      setRulesError(getErrorMessage(err));
      setRulesFields(fieldErrorMap(err));
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="grid">
      <form className="card" onSubmit={savePickup}>
        <div className="card-body">
          <h2>Pickup details</h2>
          <p className="muted">Tell borrowers where to collect this item and what to know before arriving.</p>
          <Alert variant="error">{pickupError}</Alert>
          <Alert variant="success">{pickupSuccess}</Alert>
          <FormField label="Pickup location" error={pickupFields.location}>
            <input
              type="text"
              value={pickup.location}
              maxLength={200}
              onChange={(event) => setPickupForm((current) => ({ ...current, location: event.target.value }))}
            />
          </FormField>
          <FormField label="Pickup instructions" error={pickupFields.instructions} hint="Optional. Include timing, access notes or who to call.">
            <textarea
              value={pickup.instructions}
              maxLength={1000}
              onChange={(event) => setPickupForm((current) => ({ ...current, instructions: event.target.value }))}
            />
          </FormField>
          <button className="btn" type="submit" disabled={saving === 'pickup'}>
            {saving === 'pickup' ? 'Saving...' : 'Save pickup'}
          </button>
        </div>
      </form>

      <form className="card" onSubmit={saveRules}>
        <div className="card-body">
          <h2>Borrowing rules</h2>
          <p className="muted">Set fair limits for how long borrowers can keep the item and who can reserve it.</p>
          <Alert variant="error">{rulesError}</Alert>
          <Alert variant="success">{rulesSuccess}</Alert>
          <FormField label="Max duration in days" error={rulesFields.maxBorrowDays} hint="Leave blank for no fixed limit.">
            <input
              type="number"
              min="1"
              max="365"
              step="1"
              value={rules.maxBorrowDays}
              onChange={(event) => setRulesForm((current) => ({ ...current, maxBorrowDays: event.target.value }))}
            />
          </FormField>
          <FormField label="Minimum trust score" error={rulesFields.minTrustScore} hint="Use 0 to allow any member.">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={rules.minTrustScore}
              onChange={(event) => setRulesForm((current) => ({ ...current, minTrustScore: event.target.value }))}
            />
          </FormField>
          <button className="btn" type="submit" disabled={saving === 'rules'}>
            {saving === 'rules' ? 'Saving...' : 'Save rules'}
          </button>
        </div>
      </form>
    </div>
  );
}
