// ITEM DETAILS - Owner: Member 7 - Requirements: 19, 20 (and 33/35 via the wired-in pieces)
// Route: /catalog/:id   Access: public (guests see a "Register to reserve" prompt - Req 35)
//
// Layout slots are ALREADY WIRED so other members' components appear here without anyone editing this file:
//   <FavoriteButton/>  -> Member 9 (Req 37)      <PickupInfo/> + <ManualViewer/> -> Member 6 (Req 30, 33)
// Member 7: build gallery (components/catalog/ItemGallery), title, category, description, condition notes,
//           deposit, owner NAME (Req 20). Sprint 2 slots are marked below.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getItem } from '../../api/catalog.api';
import { getErrorMessage } from '../../api/axios';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import FavoriteButton from '../../components/favorites/FavoriteButton';
import PickupInfo from '../../components/items/PickupInfo';
import ManualViewer from '../../components/items/ManualViewer';
import ItemGallery from '../../components/catalog/ItemGallery';

export default function ItemDetailsPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getItem(id).then((d) => setItem(d.item)).catch((e) => setError(getErrorMessage(e)));
  }, [id]);

  if (error) return <div className="container"><Alert variant="error">{error}</Alert></div>;
  if (!item) return <Spinner />;

  return (
    <div className="container">
      <h1>{item.title} <FavoriteButton itemId={item._id} /></h1>
      <ItemGallery photos={item.photos} />
      {/* TODO(M7): category, description, condition notes, deposit, owner name, guest "register to reserve" prompt */}
      <PickupInfo item={item} />
      <ManualViewer item={item} />
      {/* Sprint 2 slots: reservation calendar (43), reserve button (45), owner trust score (91), alternatives (92) */}
    </div>
  );
}
