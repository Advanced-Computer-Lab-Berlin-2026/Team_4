// AlternativeItems - Owner: Member 7 - Req 92
// Props: { itemId, start, end } - similar items (same category / lender tags) that are free for the dates.
import { useEffect, useState } from 'react';
import { getAlternatives } from '../../../api/catalog.api';
import { getErrorMessage } from '../../../api/axios';
import Alert from '../../common/Alert';
import Spinner from '../../common/Spinner';
import ItemCard from '../../items/ItemCard';

export default function AlternativeItems({ itemId, start, end }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!start || !end) return undefined;
    let ignore = false;
    setItems(null);
    setError('');
    getAlternatives(itemId, { start, end })
      .then((d) => { if (!ignore) setItems(d.items); })
      .catch((e) => { if (!ignore) setError(getErrorMessage(e)); });
    return () => { ignore = true; };
  }, [itemId, start, end]);

  if (!start || !end) return null;
  return (
    <section aria-label="Similar items available for your dates">
      <h3>Similar items available for your dates</h3>
      <Alert variant="error">{error}</Alert>
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <p className="muted">No similar items are free for those dates.</p>}
      {items && items.length > 0 && (
        <div className="grid">
          {items.map((it) => <ItemCard key={it._id} item={it} to={`/catalog/${it._id}?start=${start}&end=${end}`} />)}
        </div>
      )}
    </section>
  );
}
