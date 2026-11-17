import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { cancelReservation, getReservation, listReservations } from '../../api/reservations.api';
import { useAuth } from '../../context/AuthContext';
import ReservationChatPanel from '../../components/sprint2/m1/ReservationChatPanel';
import DeliveryStatusPanel from '../../components/sprint2/m6/DeliveryStatusPanel';
import styles from '../../styles/sprint2/member1.module.css';

function List() {
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    listReservations(page).then((data) => {
      if (current) setResults(data);
    }).catch((failure) => {
      if (current) setError(getErrorMessage(failure));
    });
    return () => { current = false; };
  }, [page]);

  function changePage(next) {
    setResults(null);
    setError('');
    setPage(next);
  }

  return (
    <>
      <h1>Reservations</h1>
      <Link to="/reserve">Reserve an item</Link>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!results && !error && <p role="status">Loading reservations…</p>}
      {results && (
        <>
          {!results.items.length && <p>No reservations on this page.</p>}
          <ul className={styles.list}>{results.items.map((reservation) => (
            <li key={reservation.id}>
              <Link to={'/my-reservations/' + reservation.id}>{reservation.title}</Link>{' '}
              ({reservation.startDate.slice(0, 10)} · {reservation.status})
            </li>
          ))}</ul>
          <div className={styles.actions}>
            <button className={styles.button} disabled={page === 1} onClick={() => changePage(page - 1)}>Previous page</button>
            <button className={styles.button} disabled={!results.hasNext} onClick={() => changePage(page + 1)}>Next page</button>
          </div>
        </>
      )}
    </>
  );
}

function Details({ reservationId }) {
  const { user } = useAuth();
  const userId = user._id || user.id;
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let current = true;
    getReservation(reservationId).then((data) => {
      if (current) setReservation(data);
    }).catch((failure) => {
      if (current) setError(getErrorMessage(failure));
    });
    return () => { current = false; };
  }, [reservationId]);

  async function confirmCancellation() {
    setError('');
    setWorking(true);
    try {
      setReservation(await cancelReservation(reservationId));
      setConfirming(false);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setWorking(false);
    }
  }

  const open = reservation && ['pending', 'confirmed', 'active'].includes(reservation.status);
  const canCancel = open && reservation.borrowerId === userId &&
    reservation.status !== 'active' && new Date(reservation.startDate) > new Date();

  return (
    <>
      <Link to="/my-reservations">Back to reservations</Link>
      <h1>{reservation ? reservation.title : 'Reservation'}</h1>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!reservation && !error && <p role="status">Loading reservation…</p>}
      {reservation && (
        <>
          <p role="status">Status: {reservation.status}</p>
          <p>{reservation.fulfilmentMethod === 'delivery' ? 'Delivery' : 'Pickup'} {reservation.startDate.slice(0, 10)} · Return {reservation.endDate.slice(0, 10)}</p>
          {canCancel && !confirming && <button className={styles.button} onClick={() => setConfirming(true)}>Cancel reservation</button>}
          {canCancel && confirming && (
            <div aria-label="Confirm cancellation" role="group">
              <p>Cancel this reservation and release the reserved dates?</p>
              <div className={styles.actions}>
                <button className={styles.button} disabled={working} onClick={confirmCancellation}>Confirm cancellation</button>
                <button className={styles.button} disabled={working} onClick={() => setConfirming(false)}>Keep reservation</button>
              </div>
            </div>
          )}
          {reservation.status === 'cancelled' && (reservation.depositAmount > 0 || reservation.refundAmount > 0) && (
            <p>Wallet refund: {reservation.refundAmount} EGP</p>
          )}
          {reservation.fulfilmentMethod === 'delivery' && (
            <DeliveryStatusPanel reservationId={reservationId} onChange={(record) => {
              setReservation((current) => ({ ...current, status: record.reservationStatus }));
            }} />
          )}
          {open && (reservation.status === 'active' || new Date(reservation.endDate) > new Date()) && (
            <ReservationChatPanel reservationId={reservationId} userId={userId} />
          )}
        </>
      )}
    </>
  );
}

export default function ReservationChatPage() {
  const { reservationId } = useParams();
  return (
    <section className={styles.section}>
      {reservationId ? <Details key={reservationId} reservationId={reservationId} /> : <List />}
    </section>
  );
}
