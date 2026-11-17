import { useEffect, useId, useState } from 'react';
import { getErrorMessage } from '../../../api/axios';
import { getDeliveryOffer } from '../../../api/delivery.api';
import styles from '../../../styles/sprint2/member6.module.css';

export const formatEGP = (amount) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'EGP',
}).format(amount);

export function formatDeliveryAddress(address) {
  if (typeof address === 'string') return address.trim();
  return [address?.street, address?.city, address?.state, address?.postalCode, address?.country]
    .filter(Boolean).join(', ');
}

export default function FulfilmentSelector({ itemIds = [], value, onChange, savedAddress, disabled = false }) {
  const id = useId();
  const address = formatDeliveryAddress(savedAddress);
  const [customAddress, setCustomAddress] = useState(() => !!value?.deliveryAddress && value.deliveryAddress !== address);
  const uniqueItems = [...new Set(itemIds.filter(Boolean))].sort().join(',');
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    if (!uniqueItems) return;
    const controller = new AbortController();
    Promise.all(uniqueItems.split(',').map((itemId) => getDeliveryOffer(itemId, controller.signal)))
      .then((offers) => {
        if (!controller.signal.aborted) setAvailable({ key: uniqueItems, offers });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAvailable({ key: uniqueItems, error: getErrorMessage(error) });
      });
    return () => controller.abort();
  }, [uniqueItems]);

  const current = available?.key === uniqueItems ? available : null;
  const offers = current?.offers;
  const canDeliver = offers?.length > 0 && offers.every((offer) => offer.offered);
  const feeByItem = new Map(offers?.map((offer) => [String(offer.id), offer.fee]));
  const feeMinor = canDeliver ? itemIds.reduce((sum, itemId) => sum + Math.round(feeByItem.get(String(itemId)) * 100), 0) : 0;
  const method = value?.method ?? 'pickup';
  const manual = customAddress || !address;

  function changeMethod(next) {
    onChange(next === 'pickup' ? { method: 'pickup' } : {
      method: 'delivery', deliveryAddress: manual ? '' : address,
    });
  }

  return (
    <fieldset className={`${styles.fieldset} ${styles.stack}`} disabled={disabled}>
      <legend>Pickup or delivery</legend>
      <label className={styles.choice}>
        <input type="radio" name={`${id}-method`} checked={method === 'pickup'} onChange={() => changeMethod('pickup')} />
        Self-pickup
      </label>
      {canDeliver && (
        <label className={styles.choice}>
          <input type="radio" name={`${id}-method`} checked={method === 'delivery'} onChange={() => changeMethod('delivery')} />
          Delivery ({formatEGP(feeMinor / 100)})
        </label>
      )}
      {uniqueItems && !current && <p role="status">Checking delivery options…</p>}
      {current?.error && <p role="alert" className={styles.error}>{current.error}</p>}
      {offers && !canDeliver && <p>Delivery is unavailable for {itemIds.length === 1 ? 'this item' : 'one or more items in this checkout'}.</p>}
      {canDeliver && method === 'delivery' && (
        <div className={styles.stack}>
          {address && (
            <div className={styles.stack} role="group" aria-label="Delivery address options">
              <label className={styles.choice}>
                <input type="radio" name={`${id}-address`} checked={!manual} onChange={() => {
                  setCustomAddress(false);
                  onChange({ method: 'delivery', deliveryAddress: address });
                }} />
                Use saved address ({address})
              </label>
              <label className={styles.choice}>
                <input type="radio" name={`${id}-address`} checked={manual} onChange={() => {
                  setCustomAddress(true);
                  onChange({ method: 'delivery', deliveryAddress: '' });
                }} />
                Enter another address
              </label>
            </div>
          )}
          {manual && (
            <label className={styles.field}>Delivery address
              <textarea required maxLength={500} rows={3} autoComplete="street-address" value={value?.deliveryAddress ?? ''}
                onChange={(event) => onChange({ method: 'delivery', deliveryAddress: event.target.value })} />
            </label>
          )}
        </div>
      )}
    </fieldset>
  );
}
