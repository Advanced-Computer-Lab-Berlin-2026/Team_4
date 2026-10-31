// PickupInfo - Owner: Member 6 - Requirements: 30, 31
// Props: { item } - pickup location/instructions + borrowing rules display
export default function PickupInfo({ item }) {
  const pickup = item?.pickup || {};
  const rules = item?.rules || {};
  const hasPickup = pickup.location || pickup.instructions;
  const hasRules = rules.maxBorrowDays || Number(rules.minTrustScore || 0) > 0;

  if (!hasPickup && !hasRules) return null;

  return (
    <section className="card">
      <div className="card-body">
        <h2>Pickup and borrowing rules</h2>
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
      </div>
    </section>
  );
}
