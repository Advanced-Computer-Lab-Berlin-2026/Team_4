// MY HOUSEHOLD - Owner: Member 8 - Requirements: 24, 25, 26, 27
// Route: /household   Access: member   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// API calls: src/api/*.api.js   Shared UI: src/components/common/*
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listLinks } from '../../api/household.api';
import { getErrorMessage } from '../../api/axios';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import LinkRequestForm from '../../components/household/LinkRequestForm';
import LinkList from '../../components/household/LinkList';

const HOUSEHOLD_STYLES = `
  .household-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    margin-top: 1rem;
  }

  @media (min-width: 900px) {
    .household-layout {
      grid-template-columns: minmax(280px, 380px) 1fr;
      align-items: start;
    }
  }

  .household-address-banner {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .household-section {
    margin-bottom: 1.5rem;
  }

  .household-section:last-child {
    margin-bottom: 0;
  }

  .household-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .household-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .household-link-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  @media (min-width: 640px) {
    .household-link-card {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }

  .household-link-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .household-link-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .household-link-meta {
    font-size: 0.88rem;
    color: var(--muted);
  }

  .household-link-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .household-toast {
    position: fixed;
    top: 1.25rem;
    right: 1.25rem;
    z-index: 9999;
    min-width: 280px;
    max-width: 420px;
    padding: 0.85rem 1.1rem;
    border-radius: 8px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.14);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.92rem;
    font-weight: 500;
    animation: householdToastSlideIn 0.25s ease-out forwards;
  }

  .household-toast-error {
    background-color: #fef2f2;
    color: #991b1b;
    border: 1px solid #f87171;
  }

  .household-toast-success {
    background-color: #f0fdf4;
    color: #166534;
    border: 1px solid #4ade80;
  }

  .household-toast-close {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.2rem;
    opacity: 0.75;
  }

  .household-toast-close:hover {
    opacity: 1;
  }

  @keyframes householdToastSlideIn {
    from {
      transform: translateY(-16px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

export default function HouseholdPage() {
  const { user } = useAuth();
  const currentUserId = user?._id || user?.id;
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHouseholdLinks = useCallback(async () => {
    try {
      setError('');
      const data = await listLinks();
      setLinks(data.links || data.items || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchHouseholdLinks();
  }, [fetchHouseholdLinks]);

  const formattedAddress = user?.address
    ? [
        user.address.street,
        user.address.city,
        user.address.state,
        user.address.postalCode,
        user.address.country,
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div className="container">
      <style>{HOUSEHOLD_STYLES}</style>
      <h1>My household</h1>

      {formattedAddress && (
        <div className="household-address-banner">
          <span className="muted">Your registered home address: </span>
          <strong>{formattedAddress}</strong>
        </div>
      )}

      <div className="household-layout">
        <LinkRequestForm key={currentUserId} onSent={fetchHouseholdLinks} />

        <div>
          {loading ? (
            <Spinner label="Loading household members..." />
          ) : error ? (
            <Alert variant="error">{error}</Alert>
          ) : (
            <LinkList
              key={`list-${currentUserId}`}
              links={links}
              currentUserId={currentUserId}
              onChanged={fetchHouseholdLinks}
            />
          )}
        </div>
      </div>
    </div>
  );
}