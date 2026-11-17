// PickupInfo - Owner: Member 6 - Requirements: 30, 31
// Props: { item } - pickup location/instructions + borrowing rules display
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasSprint2Routes } from '../sprint2/m6/routesAvailability';

export default function PickupInfo({ item }) {
  const { isMember } = useAuth();
  const pickup = item?.pickup || {};
  const rules = item?.rules || {};
  const hasPickup = pickup.location || pickup.instructions;
  const hasRules = rules.maxBorrowDays || Number(rules.minTrustScore || 0) > 0;
  const canReserve = hasSprint2Routes && isMember && item?._id;

  if (!hasPickup && !hasRules && !canReserve) return null;

  return (
    <section className="card">
      <div className="card-body">
        <h2>{hasPickup || hasRules ? 'Pickup and borrowing rules' : 'Reservations'}</h2>
        {hasPickup && (
          <>
            <h3>Pickup</h3>
            {pickup.location && <p><strong>Location:</strong> {pickup.location}</p>}
            {pickup.instructions && <p><strong>Instructions:</strong> {pickup.instructions}</p>}
          </>
        )}
        {hasRules && (
          <>
            <h3>Rules</h3>
            <p>
              <strong>Max duration:</strong>{' '}
              {rules.maxBorrowDays ? `${rules.maxBorrowDays} day${rules.maxBorrowDays === 1 ? '' : 's'}` : 'No fixed limit'}
            </p>
            <p><strong>Minimum trust score:</strong> {rules.minTrustScore || 0}</p>
          </>
        )}
        {canReserve && <p>
          <Link to={`/reserve/${encodeURIComponent(item._id)}`}>Reserve with delivery or a promo code</Link>
          {' · '}
          <Link to="/delivery-tracking">Track a delivery</Link>
        </p>}
      </div>
    </section>
  );
}
