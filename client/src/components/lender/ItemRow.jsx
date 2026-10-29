// ItemRow - Owner: Member 5 - Requirements: 15, 21
// Props: { item, onArchiveToggle, busy } — one of my items in My Items: shared ItemCard + status + Edit / Archive buttons.
//   onArchiveToggle(item) is called when Archive or Unarchive is clicked; busy = that request is running.
import { Link } from 'react-router-dom';
import ItemCard from '../items/ItemCard';
import StatusBadge from '../common/StatusBadge';
import { formatDate } from '../../utils/format';

export const itemStatus = (item) => {
  if (item.moderationStatus === 'removed') return { key: 'removed', label: 'Removed' };
  return item.isArchived ? { key: 'archived', label: 'Archived' } : { key: 'active', label: 'Active' };
};

export default function ItemRow({ item, onArchiveToggle, busy = false }) {
  const editUrl = `/lender/items/${item._id}/edit`;
  const status = itemStatus(item);
  let toggleLabel = item.isArchived ? 'Unarchive' : 'Archive';
  if (busy) toggleLabel = item.isArchived ? 'Unarchiving...' : 'Archiving...';

  return (
    <ItemCard
      item={item}
      to={editUrl}
      actions={(
        <>
          <div className="my-items-meta">
            <StatusBadge status={status.key}>{status.label}</StatusBadge>
            {item.createdAt && <span className="muted">Listed {formatDate(item.createdAt)}</span>}
          </div>
          {status.key === 'removed' && (
            <p className="my-items-note muted">Removed by an admin, so it isn&apos;t shown in the catalog.</p>
          )}
          <Link to={editUrl} className="btn btn-secondary" aria-label={`Edit ${item.title}`}>Edit</Link>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onArchiveToggle(item)}
            aria-label={`${item.isArchived ? 'Unarchive' : 'Archive'} ${item.title}`}>{toggleLabel}</button>
        </>
      )}
    />
  );
}
