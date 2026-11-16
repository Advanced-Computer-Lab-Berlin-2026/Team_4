import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../../api/axios';
import { setDeliveryOffer } from '../../../api/delivery.api';
import styles from '../../../styles/sprint2/member6.module.css';

export default function ItemDeliverySettings({ item, onSaved }) {
  const itemId = item?._id;
  const savedOffered = item?.delivery?.offered ?? false;
  const savedFee = item?.delivery?.fee ?? 0;
  const [offered, setOffered] = useState(savedOffered);
  const [fee, setFee] = useState(String(savedFee));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOffered(savedOffered);
    setFee(String(savedFee));
  }, [itemId, savedOffered, savedFee]);

  async function save(event) {
    event.preventDefault();
    if (saving || !itemId) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await setDeliveryOffer(itemId, { offered, fee: Number(fee || 0) });
      const delivery = { offered: updated.offered, fee: updated.fee };
      setFee(String(delivery.fee));
      setOffered(delivery.offered);
      onSaved?.({ ...item, delivery });
      setSaved(true);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  if (!itemId) return null;

  return (
    <form className={`card ${styles.block}`} onSubmit={save}>
      <div className={`card-body ${styles.stack}`}>
        <h2>Delivery settings</h2>
        <label className={styles.choice}>
          <input type="checkbox" checked={offered} disabled={saving} onChange={(event) => {
            setOffered(event.target.checked);
            setSaved(false);
          }} />
          Offer delivery for this item
        </label>
        {offered && (
          <label className={styles.field}>Delivery fee (EGP)
            <input type="number" min="0" step="0.01" required value={fee} disabled={saving}
              onChange={(event) => { setFee(event.target.value); setSaved(false); }} />
          </label>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {saved && <p role="status">Delivery settings saved.</p>}
        <div><button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save delivery settings'}</button></div>
      </div>
    </form>
  );
}
