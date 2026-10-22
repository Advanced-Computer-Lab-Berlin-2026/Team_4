// ITEM EDITOR - Owner: Member 5 - Requirements: 13, 14
// Routes: /lender/items/new  and  /lender/items/:id/edit   Access: verified lender
// This page is the TAB CONTAINER. Each tab is a separate file owned by a different member, so nobody conflicts:
//   Details        -> components/lender/item-editor/ItemInfoTab.jsx          (Member 5: Req 13, 14)
//   Pickup & rules -> components/lender/item-editor/ItemPickupRulesTab.jsx   (Member 6: Req 30, 31)
//   Manual         -> components/lender/item-editor/ItemManualTab.jsx        (Member 6: Req 32)
// Tab contract:  <Tab item={item|null} onSaved={(updatedItem) => ...} />
// Pickup/Manual tabs are disabled until the item exists (after the first save of the Details tab).
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMyItem } from '../../api/items.api';
import { getErrorMessage } from '../../api/axios';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import ItemInfoTab from '../../components/lender/item-editor/ItemInfoTab';
import ItemPickupRulesTab from '../../components/lender/item-editor/ItemPickupRulesTab';
import ItemManualTab from '../../components/lender/item-editor/ItemManualTab';

const TABS = [
  { key: 'details', label: 'Details', Component: ItemInfoTab, needsItem: false },
  { key: 'pickup', label: 'Pickup & rules', Component: ItemPickupRulesTab, needsItem: true },
  { key: 'manual', label: 'Usage manual', Component: ItemManualTab, needsItem: true },
];

export default function ItemEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('details');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getMyItem(id).then((d) => setItem(d.item)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
  }, [id]);

  const handleSaved = (saved) => {
    setItem(saved);
    if (!id && saved?._id) navigate(`/lender/items/${saved._id}/edit`, { replace: true }); // after create
  };

  if (loading) return <Spinner />;
  const Active = TABS.find((t) => t.key === tab).Component;

  return (
    <div className="container">
      <h1>{id ? 'Edit item' : 'New item'}</h1>
      <Alert variant="error">{error}</Alert>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            disabled={t.needsItem && !item} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <Active item={item} onSaved={handleSaved} />
    </div>
  );
}
