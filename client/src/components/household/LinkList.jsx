// LinkList - Owner: Member 8 - Requirements: 25, 26, 27
// Props: { links, currentUserId, onChanged } — incoming/outgoing/accepted lists
import { useState, useEffect } from 'react';
import { respondToRequest, removeLink } from '../../api/household.api';
import { getErrorMessage } from '../../api/axios';
import { formatDate } from '../../utils/format';
import StatusBadge from '../common/StatusBadge';

const formatRelation = (rel = '') =>
  rel ? rel.charAt(0).toUpperCase() + rel.slice(1) : '';

export default function LinkList({ links = [], currentUserId, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const uid = String(currentUserId || '');

  // Auto-dismiss toast notifications after 4 seconds
  useEffect(() => {
    if (actionError || actionSuccess) {
      const timer = setTimeout(() => {
        setActionError('');
        setActionSuccess('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [actionError, actionSuccess]);

  // Partition links into clear groups (exclude declined unless needed, or show active/pending)
  const incomingPending = links.filter(
    (l) => l.status === 'pending' && String(l.recipient?._id || l.recipient) === uid
  );
  const outgoingPending = links.filter(
    (l) => l.status === 'pending' && String(l.requester?._id || l.requester) === uid
  );
  const acceptedLinks = links.filter((l) => l.status === 'accepted');

  const getOtherMember = (link) => {
    const isRequester = String(link.requester?._id || link.requester) === uid;
    return isRequester ? link.recipient : link.requester;
  };

  const handleRespond = async (linkId, action) => {
    if (action === 'decline') {
      const ok = window.confirm('Decline this household link request?');
      if (!ok) return;
    }

    setActionError('');
    setActionSuccess('');
    try {
      setBusyId(linkId);
      const res = await respondToRequest(linkId, { action });
      setActionSuccess(
        res.message ||
          (action === 'accept'
            ? 'Household link request accepted.'
            : 'Household link request declined.')
      );
      if (onChanged) onChanged();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (link, isPendingCancel = false) => {
    const other = getOtherMember(link);
    const label = other?.name || other?.username || 'this member';
    const confirmText = isPendingCancel
      ? `Cancel your pending household request to ${label}?`
      : `Remove this household link with ${label}?`;

    if (!window.confirm(confirmText)) return;

    setActionError('');
    setActionSuccess('');
    try {
      setBusyId(link._id);
      const res = await removeLink(link._id);
      setActionSuccess(
        res.message ||
          (isPendingCancel ? 'Household link request cancelled.' : 'Household link removed.')
      );
      if (onChanged) onChanged();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const renderCard = (link, type) => {
    const other = getOtherMember(link);
    const isBusy = busyId === link._id;

    return (
      <div key={link._id} className="household-link-card">
        <div className="household-link-info">
          <div className="household-link-title">
            <h3>{other?.name || other?.username || 'Member'}</h3>
            <StatusBadge status={link.status} />
          </div>
          <div className="household-link-meta">
            Relation: <strong>{formatRelation(link.relation)}</strong>
            {other?.email ? ` · ${other.email}` : ''}
            {other?.phone ? ` · ${other.phone}` : ''}
          </div>
          <div className="household-link-meta">
            {type === 'incoming' && `Requested on ${formatDate(link.createdAt)}`}
            {type === 'outgoing' && `Sent on ${formatDate(link.createdAt)} · Waiting for response`}
            {type === 'accepted' &&
              `Linked ${formatDate(link.respondedAt || link.updatedAt || link.createdAt)}`}
          </div>
        </div>

        <div className="household-link-actions">
          {type === 'incoming' && (
            <>
              <button
                type="button"
                className="btn"
                disabled={isBusy}
                onClick={() => handleRespond(link._id, 'accept')}
              >
                {isBusy ? 'Saving…' : 'Accept'}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isBusy}
                onClick={() => handleRespond(link._id, 'decline')}
              >
                Decline
              </button>
            </>
          )}

          {type === 'outgoing' && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={isBusy}
              onClick={() => handleRemove(link, true)}
            >
              {isBusy ? 'Removing…' : 'Cancel request'}
            </button>
          )}

          {type === 'accepted' && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={isBusy}
              onClick={() => handleRemove(link, false)}
            >
              {isBusy ? 'Removing…' : 'Remove link'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {actionError && (
        <div className="household-toast household-toast-error" role="alert">
          <span>{actionError}</span>
          <button
            type="button"
            className="household-toast-close"
            onClick={() => setActionError('')}
            aria-label="Close notification"
          >
            &times;
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="household-toast household-toast-success" role="status">
          <span>{actionSuccess}</span>
          <button
            type="button"
            className="household-toast-close"
            onClick={() => setActionSuccess('')}
            aria-label="Close notification"
          >
            &times;
          </button>
        </div>
      )}

      {/* Incoming Pending Requests (Req 25) */}
      <section className="household-section" aria-labelledby="incoming-heading">
        <div className="household-section-header">
          <h2 id="incoming-heading">Incoming requests</h2>
          <span className="muted">{incomingPending.length}</span>
        </div>
        {incomingPending.length === 0 ? (
          <p className="muted">No incoming household requests right now.</p>
        ) : (
          <div className="household-list">
            {incomingPending.map((link) => renderCard(link, 'incoming'))}
          </div>
        )}
      </section>

      {/* Accepted Household Members (Req 26 & 27) */}
      <section className="household-section" aria-labelledby="accepted-heading">
        <div className="household-section-header">
          <h2 id="accepted-heading">Linked household members</h2>
          <span className="muted">{acceptedLinks.length}</span>
        </div>
        {acceptedLinks.length === 0 ? (
          <p className="muted">
            You do not have any accepted household links yet. Send a request to a family member
            at your address to share household benefits.
          </p>
        ) : (
          <div className="household-list">
            {acceptedLinks.map((link) => renderCard(link, 'accepted'))}
          </div>
        )}
      </section>

      {/* Outgoing Pending Requests (Req 26 & 27) */}
      <section className="household-section" aria-labelledby="outgoing-heading">
        <div className="household-section-header">
          <h2 id="outgoing-heading">Sent requests (pending)</h2>
          <span className="muted">{outgoingPending.length}</span>
        </div>
        {outgoingPending.length === 0 ? (
          <p className="muted">No outgoing pending requests.</p>
        ) : (
          <div className="household-list">
            {outgoingPending.map((link) => renderCard(link, 'outgoing'))}
          </div>
        )}
      </section>
    </div>
  );
}