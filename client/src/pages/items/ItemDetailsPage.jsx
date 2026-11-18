// ITEM DETAILS - Owner: Member 7 ALONE (other members supply components, they never edit this file)
// Route: /catalog/:id   Access: public (guests see a "Register to reserve" prompt - Req 35)
// Sprint 1: 19, 20 (+33/35 via wired-in pieces).  Sprint 2: 43 calendar, 65/66 waitlist, 92 alternatives.
//
// Composed components:
//   Member 9: <FavoriteButton/>   Member 6: <PickupInfo/> + <ManualViewer/>
//   Member 3: <TrustSummary userId/>     Member 5: <BorrowListButton itemId/>
//   Member 7: ItemGallery, AvailabilityCalendar, WaitlistButton, AlternativeItems
//
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getItem } from '../../api/catalog.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import FavoriteButton from '../../components/favorites/FavoriteButton';
import PickupInfo from '../../components/items/PickupInfo';
import ManualViewer from '../../components/items/ManualViewer';
import ItemGallery from '../../components/catalog/ItemGallery';
import TrustSummary from '../../components/sprint2/m3/TrustSummary';
import BorrowListButton from '../../components/sprint2/m5/BorrowListButton';
import AvailabilityCalendar from '../../components/sprint2/m7/AvailabilityCalendar';
import WaitlistButton from '../../components/sprint2/m7/WaitlistButton';
import AlternativeItems from '../../components/sprint2/m7/AlternativeItems';
import { daysBetween, isDay, reserveUrl, todayDay } from '../../components/sprint2/m7/dateUtils';
import styles from '../../styles/sprint2/member7.module.css';
import '../../components/catalog/catalog.css';

export default function ItemDetailsPage() {
  const { id } = useParams();
  const { user, isMember, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState(null);
  const [calendarVersion, setCalendarVersion] = useState(0);

  // chosen dates live in the URL (?start=&end=) so they can be shared and survive refresh
  const qs = params.get('start') || '';
  const qe = params.get('end') || '';
  const start = isDay(qs) && qs >= todayDay() ? qs : '';
  const end = start && isDay(qe) && qe > start ? qe : '';
  const range = { start, end };
  const onAvailabilityChange = useCallback((available) => {
    setAvailability({ id, start, end, available });
  }, [id, start, end]);
  const available = availability?.id === id && availability.start === start && availability.end === end
    ? availability.available : null;
  const setRange = (r) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (r.start) next.set('start', r.start); else next.delete('start');
    if (r.end) next.set('end', r.end); else next.delete('end');
    return next;
  }, { replace: true });

  useEffect(() => {
    let ignore = false;
    setItem(null);
    setError('');
    getItem(id)
      .then((d) => { if (!ignore) setItem(d.item); })
      .catch((e) => { if (!ignore) setError(getErrorMessage(e)); });
    return () => { ignore = true; };
  }, [id]);

  if (error) {
    return (
      <div className="container">
        <Alert variant="error">{error}</Alert>
        <Link to="/catalog" className="btn btn-secondary">Back to catalog</Link>
      </div>
    );
  }
  if (!item) return <Spinner />;

  const hasRange = !!(range.start && range.end);
  const canWaitlist = hasRange && daysBetween(start, end) <= 90;
  const isOwner = !!user && String(item.owner?._id) === String(user._id);

  return (
    <div className={`container ${styles.browse}`}>
      <p className="muted"><Link to="/catalog">Catalog</Link>
        {item.category?.slug && <> / <Link to={`/categories/${item.category.slug}`}>{item.category.name}</Link></>}
      </p>
      <h1>{item.title} <FavoriteButton itemId={item._id} /></h1>

      <div className="catalog-details">
        <div>
          <ItemGallery photos={item.photos} title={item.title} />

          <h2>Description</h2>
          <p className="catalog-text">{item.description}</p>

          <h2>Condition notes</h2>
          <p className="catalog-text">{item.conditionNotes || <span className="muted">The lender has not added condition notes.</span>}</p>

          <PickupInfo item={item} />
          <ManualViewer item={item} />

          <section className={styles.availability} aria-labelledby="availability-heading">
            <h2 id="availability-heading">Availability</h2>
            <AvailabilityCalendar key={item._id} itemId={item._id} value={range} onChange={setRange}
              onAvailabilityChange={onAvailabilityChange} refreshKey={calendarVersion} />

            {hasRange && available === true && (
              <div className={styles.statusBlock}>
                <Alert variant="success">These dates are available.</Alert>
                {isMember && !isOwner && (
                  <div className="row">
                    <Link className="btn" to={reserveUrl(item._id, range.start, range.end)}>Reserve these dates</Link>
                    <BorrowListButton itemId={item._id} ownerId={item.owner?._id} maxBorrowDays={item.rules?.maxBorrowDays} />
                  </div>
                )}
              </div>
            )}

            {hasRange && available === false && (
              <div className={styles.statusBlock}>
                <Alert variant="info">Part or all of this range is booked or on hold.</Alert>
                {canWaitlist ? (
                  <>
                    {!isOwner && <WaitlistButton itemId={item._id} start={range.start} end={range.end}
                      onChange={() => setCalendarVersion((version) => version + 1)} />}
                    <AlternativeItems itemId={item._id} start={range.start} end={range.end} />
                  </>
                ) : <p>Choose a range of up to 90 days to join a waitlist or find alternatives.</p>}
              </div>
            )}
          </section>
        </div>

        <aside className="card">
          <div className="card-body">
            <dl className="catalog-facts">
              <div><dt>Deposit</dt><dd>{formatMoney(item.depositAmount)}</dd></div>
              <div><dt>Category</dt><dd>{item.category?.name}</dd></div>
              <div><dt>Lender</dt><dd>{item.owner?.name || 'Unknown'}</dd></div>
            </dl>
            {item.owner?._id && <TrustSummary userId={item.owner._id} compact hideLink={!user} />}

            {/* Req 35: guests may browse but must register to reserve */}
            {!authLoading && !user && (
              <Alert variant="info">
                Want to borrow this? <Link to="/register">Register</Link> or <Link to="/login">log in</Link> to reserve it.
              </Alert>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
