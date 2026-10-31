// ItemPickupRulesTab - Owner: Member 6 - Requirements: 30, 31
// Props: { item, onSaved } - pickup location/instructions + borrowing rules
import { useRef, useState } from 'react';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { setPickup, setRules } from '../../../api/itemPolicies.api';
import Alert from '../../common/Alert';
import FormField from '../../common/FormField';

const fieldErrorMap = (err) =>
    Object.fromEntries(getFieldErrors(err).map((fieldError) => [fieldError.field, fieldError.message]));

const pickupFrom = (item) => ({
  location: item?.pickup?.location || '',
  instructions: item?.pickup?.instructions || '',
});

const rulesFrom = (item) => ({
  maxBorrowDays: item?.rules?.maxBorrowDays ?? '',
  minTrustScore: item?.rules?.minTrustScore ?? 0,
});

export default function ItemPickupRulesTab({ item, onSaved }) {
  if (!item?._id) {
    return <Alert variant="info">Save the item details before setting pickup and borrowing rules.</Alert>;
  }

  // Reset drafts when changing items, not when saving one part of this item.
  return <ItemPickupRulesForm key={item._id} item={item} onSaved={onSaved} />;
}

function ItemPickupRulesForm({ item, onSaved }) {
  const [pickup, setPickupForm] = useState(() => pickupFrom(item));
  const [rules, setRulesForm] = useState(() => rulesFrom(item));
  const [pickupError, setPickupError] = useState('');
  const [rulesError, setRulesError] = useState('');
  const [pickupFields, setPickupFields] = useState({});
  const [rulesFields, setRulesFields] = useState({});
  const [pickupSuccess, setPickupSuccess] = useState('');
  const [rulesSuccess, setRulesSuccess] = useState('');
  const [saving, setSaving] = useState('');

  const savingRef = useRef(false);

  const savePickup = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving('pickup');
    setPickupError('');
    setPickupFields({});
    setPickupSuccess('');
    try {
      const data = await setPickup(item._id, pickup);
      setPickupForm(pickupFrom(data.item));
      onSaved?.(data.item);
      setPickupSuccess('Pickup details saved.');
    } catch (err) {
      setPickupError(getErrorMessage(err));
      setPickupFields(fieldErrorMap(err));
    } finally {
      savingRef.current = false;
      setSaving('');
    }
  };

  const saveRules = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
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
      setRulesForm(rulesFrom(data.item));
      onSaved?.(data.item);
      setRulesSuccess('Borrowing rules saved.');
    } catch (err) {
      setRulesError(getErrorMessage(err));
      setRulesFields(fieldErrorMap(err));
    } finally {
      savingRef.current = false;
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
                  disabled={!!saving}
                  type="text"
                  value={pickup.location}
                  maxLength={200}
                  onChange={(event) => setPickupForm((current) => ({ ...current, location: event.target.value }))}
              />
            </FormField>
            <FormField label="Pickup instructions" error={pickupFields.instructions} hint="Optional. Include timing, access notes or who to call.">
            <textarea
                disabled={!!saving}
                value={pickup.instructions}
                maxLength={1000}
                onChange={(event) => setPickupForm((current) => ({ ...current, instructions: event.target.value }))}
            />
            </FormField>
            <button className="btn" type="submit" disabled={!!saving}>
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
                  disabled={!!saving}
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
                  disabled={!!saving}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={rules.minTrustScore}
                  onChange={(event) => setRulesForm((current) => ({ ...current, minTrustScore: event.target.value }))}
              />
            </FormField>
            <button className="btn" type="submit" disabled={!!saving}>
              {saving === 'rules' ? 'Saving...' : 'Save rules'}
            </button>
          </div>
        </form>
      </div>
  );
}