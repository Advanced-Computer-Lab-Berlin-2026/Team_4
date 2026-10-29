// ITEM EDITOR - Owner: Member 5 - Requirements: 13, 14
// Routes: /lender/items/new  and  /lender/items/:id/edit   Access: verified lender
// This page is the TAB CONTAINER. Each tab is a separate file owned by a different member, so nobody conflicts:
//   Details        -> components/lender/item-editor/ItemInfoTab.jsx          (Member 5: Req 13, 14)
//   Pickup & rules -> components/lender/item-editor/ItemPickupRulesTab.jsx   (Member 6: Req 30, 31)
//   Manual         -> components/lender/item-editor/ItemManualTab.jsx        (Member 6: Req 32)
// Tab contract:  <Tab item={item|null} onSaved={(updatedItem) => ...} />
// Pickup/Manual tabs are disabled until the item exists (after the first save of the Details tab).
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getMyItem } from '../../api/items.api';
import { getErrorMessage } from '../../api/axios';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import StatusBadge from '../../components/common/StatusBadge';
import ItemInfoTab from '../../components/lender/item-editor/ItemInfoTab';
import ItemPickupRulesTab from '../../components/lender/item-editor/ItemPickupRulesTab';
import ItemManualTab from '../../components/lender/item-editor/ItemManualTab';
import '../../components/lender/item-editor/item-editor.css';

// keepMounted: the Details tab stays mounted (just hidden) so switching tabs never loses what was typed.
const TABS = [
  { key: 'details', label: 'Details', Component: ItemInfoTab, needsItem: false, keepMounted: true },
  { key: 'pickup', label: 'Pickup & rules', Component: ItemPickupRulesTab, needsItem: true },
  { key: 'manual', label: 'Usage manual', Component: ItemManualTab, needsItem: true },
];

export default function ItemEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('details');
  // "Item saved" message, shown once right after the item is created. The flag arrives with the move to the edit URL.
  // React keeps this same page on screen for /new and /:id/edit, so we watch for the flag instead of reading it once.
  const [created, setCreated] = useState(false);
  useEffect(() => {
    if (!location.state?.created) return;
    setCreated(true);
    navigate(location.pathname, { replace: true, state: null }); // forget it, so a reload doesn't show it again
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let ignore = false;
    setItem(null);
    setError('');
    setLoading(!!id);
    setTab('details');
    if (id) {
      getMyItem(id)
        .then((d) => { if (!ignore) setItem(d.item); })
        .catch((e) => { if (!ignore) setError(getErrorMessage(e)); })
        .finally(() => { if (!ignore) setLoading(false); });
    }
    return () => { ignore = true; };
  }, [id]);

  const handleSaved = (saved) => {
    setItem(saved);
    if (id) setCreated(false); // a later save shows its own message
    if (!id && saved?._id) navigate(`/lender/items/${saved._id}/edit`, { replace: true, state: { created: true } }); // after create
  };

  if (loading) return <div className="container"><Spinner label="Loading item..." /></div>;

  // Edit URL but the item could not be loaded (not mine, deleted, bad id): don't show an empty "new item" form.
  if (id && !item) {
    return (
      <div className="container">
        <h1>Edit item</h1>
        <Alert variant="error">{error || 'Item not found'}</Alert>
        <Link to="/lender/items" className="btn btn-secondary">Back to my items</Link>
      </div>
    );
  }

  const removed = item?.moderationStatus === 'removed';

  return (
    <div className="container">
      <div className="item-editor-heading">
        <h1>{id ? 'Edit item' : 'New item'}</h1>
        {removed && <StatusBadge status="removed">Removed</StatusBadge>}
        {!removed && item?.isArchived && <StatusBadge status="archived">Archived</StatusBadge>}
      </div>
      {removed && <Alert variant="error">An admin removed this item, so it isn&apos;t shown in the catalog. You can still edit it.</Alert>}
      {!removed && item?.isArchived && <Alert variant="info">This item is archived, so it isn&apos;t shown in the catalog. You can still edit it.</Alert>}
      {created && <Alert variant="success">Item saved. You can now add pickup rules and a usage manual.</Alert>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`item-tab-${t.key}`} aria-controls={`item-panel-${t.key}`}
            aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            disabled={t.needsItem && !item} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {TABS.filter((t) => t.key === tab || t.keepMounted).map(({ key, Component }) => (
        <div key={key} role="tabpanel" id={`item-panel-${key}`} aria-labelledby={`item-tab-${key}`} hidden={key !== tab}>
          <Component item={item} onSaved={handleSaved} />
        </div>
      ))}
    </div>
  );
}
