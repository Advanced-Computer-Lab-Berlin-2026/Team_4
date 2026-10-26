// ITEM DETAILS - Owner: Member 7 - Requirements: 19, 20 (and 33/35 via the wired-in pieces)
// Route: /catalog/:id   Access: public (guests see a "Register to reserve" prompt - Req 35)
//
// Layout slots are ALREADY WIRED so other members' components appear here without anyone editing this file:
//   <FavoriteButton/>  -> Member 9 (Req 37)      <PickupInfo/> + <ManualViewer/> -> Member 6 (Req 30, 33)
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import '../../components/catalog/catalog.css';

export default function ItemDetailsPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');

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

  return (
    <div className="container">
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
        </div>

        <aside className="card">
          <div className="card-body">
            <dl className="catalog-facts">
              <div><dt>Deposit</dt><dd>{formatMoney(item.depositAmount)}</dd></div>
              <div><dt>Category</dt><dd>{item.category?.name}</dd></div>
              <div><dt>Lender</dt><dd>{item.owner?.name || 'Unknown'}</dd></div>
            </dl>

            {/* Req 35: guests may browse but must register to reserve */}
            {!authLoading && !user && (
              <Alert variant="info">
                Want to borrow this? <Link to="/register">Register</Link> or <Link to="/login">log in</Link> to reserve it.
              </Alert>
            )}
            {/* Sprint 2 slots: reservation calendar (43), reserve button (45), owner trust score (91), alternatives (92) */}
          </div>
        </aside>
      </div>
    </div>
  );
}
