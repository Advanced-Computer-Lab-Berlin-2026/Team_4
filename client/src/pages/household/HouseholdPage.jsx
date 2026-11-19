// MY HOUSEHOLD - Owner: Member 8 - Requirements: 24, 25, 26, 27, 88 (shared deposit discount)
// Route: /household   Access: member   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// API calls: src/api/*.api.js   Shared UI: src/components/common/*
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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

`;

export default function HouseholdPage() {
  const { user } = useAuth();
  const currentUserId = user?._id || user?.id;
  return <HouseholdContent key={currentUserId || 'guest'} user={user} currentUserId={currentUserId} />;
}

function HouseholdContent({ user, currentUserId }) {
  const requestVersion = useRef(0);
  const mounted = useRef(false);
  const [links, setLinks] = useState([]);
  const [benefit, setBenefit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHouseholdLinks = useCallback(async () => {
    if (!mounted.current) return;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      setError('');
      const data = await listLinks();
      if (mounted.current && version === requestVersion.current) {
        setLinks(data.links || data.items || []);
        setBenefit(data.benefit || null);
      }
    } catch (err) {
      if (mounted.current && version === requestVersion.current) setError(getErrorMessage(err));
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    mounted.current = true;
    fetchHouseholdLinks();
    return () => { mounted.current = false; requestVersion.current += 1; };
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

      {benefit && (
        <div className="household-address-banner" role="status">
          <span className="muted">Deposit discount: </span>
          {benefit.discountPercent > 0 ? (
            <strong>
              {benefit.discountPercent}%{' '}
              {benefit.source?.type === 'household'
                ? `from ${benefit.source.name || 'a household member'}'s ${benefit.source.tierName} membership`
                : `from your ${benefit.source?.tierName || ''} membership`}
            </strong>
          ) : (
            <strong>none yet</strong>
          )}
          <div className="muted">
            Accepted household members share the strongest deposit discount among them. Discounts do not add up,
            and pending or removed links give no discount. <Link to="/membership">View membership tiers</Link>
          </div>
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