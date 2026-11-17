import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/axios';
import { getDeliveryStatus, listDeliveries, setDeliveryStatus } from '../../../api/delivery.api';
import styles from '../../../styles/sprint2/member6.module.css';

const steps = [
  ['preparing', 'Preparing'],
  ['out_for_delivery', 'Out for delivery'],
  ['delivered', 'Delivered'],
];

const labelFor = (status) => steps.find(([id]) => id === status)?.[1] ?? 'Awaiting preparation';

function DeliveryStatus({ reservationId, onChange }) {
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, refresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getDeliveryStatus(reservationId, controller.signal).then((record) => {
      if (!controller.signal.aborted) setReservation(record);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(getErrorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [reservationId, revision]);

  async function advance(status) {
    setSaving(true);
    setError('');
    try {
      const record = await setDeliveryStatus(reservationId, status);
      setReservation(record);
      onChange?.(record);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  if (!loading && !error && reservation?.method === 'pickup') return null;

  const step = steps.findIndex(([id]) => id === reservation?.deliveryStatus);
  const next = reservation?.canUpdate ? steps[step + 1] : null;

  return (
    <section className={`${styles.stack} ${styles.block}`} aria-label="Delivery tracking" aria-busy={loading || saving}>
      <h2>Delivery tracking</h2>
      {loading && <p role="status">Checking delivery status…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {reservation?.method === 'delivery' && (
        <>
          <p role="status">Current status · {labelFor(reservation.deliveryStatus)}</p>
          {reservation.deliveryAddress && <p><strong>Delivery address</strong> {reservation.deliveryAddress}</p>}
          <ol className={styles.statusList}>
            {steps.map(([id, label], index) => <li key={id} aria-current={index === step ? 'step' : undefined}>{label}</li>)}
          </ol>
        </>
      )}
      <div className={styles.actions}>
        {next && <button type="button" className="btn" disabled={loading || saving} onClick={() => advance(next[0])}>
          {saving ? 'Updating…' : `Mark ${next[1].toLowerCase()}`}
        </button>}
        <button type="button" className="btn btn-secondary" disabled={loading || saving} onClick={() => {
          setError(''); setLoading(true); refresh((count) => count + 1);
        }}>Refresh status</button>
      </div>
    </section>
  );
}

export default function DeliveryStatusPanel({ reservationId, onChange }) {
  return reservationId ? <DeliveryStatus key={reservationId} reservationId={reservationId} onChange={onChange} /> : null;
}

function DeliveryList() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    listDeliveries(page, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(getErrorMessage(failure));
    });
    return () => controller.abort();
  }, [page]);

  function changePage(next) {
    setError('');
    setResult(null);
    setPage(next);
  }

  return (
    <>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!result && !error && <p role="status">Loading your deliveries…</p>}
      {result?.items.length === 0 && <p>No deliveries on this page.</p>}
      {!!result?.items.length && (
        <ul className={styles.statusList}>
          {result.items.map((item) => <li key={item.id}>
            <Link to={`/delivery-tracking/${item.id}`}>{item.title}</Link> · {labelFor(item.deliveryStatus)}
          </li>)}
        </ul>
      )}
      {result && (page > 1 || result.hasNext) && <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
        <button type="button" className="btn btn-secondary" disabled={!result.hasNext} onClick={() => changePage(page + 1)}>Next</button>
      </div>}
    </>
  );
}

export function DeliveryTrackingPage() {
  const { reservationId } = useParams();
  return (
    <section className={`container ${styles.page} ${styles.stack}`}>
      <h1>{reservationId ? 'Track a delivery' : 'Your deliveries'}</h1>
      {reservationId ? <>
        <Link to="/delivery-tracking">All deliveries</Link>
        <DeliveryStatusPanel reservationId={reservationId} />
      </> : <DeliveryList />}
    </section>
  );
}
