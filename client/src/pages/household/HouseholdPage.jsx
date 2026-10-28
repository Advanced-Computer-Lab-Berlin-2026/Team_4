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
import './household.css';

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