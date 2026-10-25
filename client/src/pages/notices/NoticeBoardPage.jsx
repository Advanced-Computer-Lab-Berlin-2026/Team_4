// COMMUNITY NOTICE BOARD - Owner: Member 9 - Requirements: 42
// Route: /notices - Access: member
import { useCallback, useEffect, useState } from 'react';
import { listNotices } from '../../api/notices.api';
import { getErrorMessage } from '../../api/axios';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import NoticeCard from '../../components/notices/NoticeCard';

export default function NoticeBoardPage() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { notices: loadedNotices } = await listNotices();
      setNotices(loadedNotices);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  if (loading) return <Spinner label="Loading community notices..." />;

  return (
    <div className="container">
      <h1>Community notice board</h1>
      <Alert variant="error">{error}</Alert>
      {error && (
        <button type="button" className="btn btn-secondary" onClick={loadNotices}>
          Try again
        </button>
      )}
      {!error && notices.length === 0 && (
        <p className="muted">There are no community notices yet.</p>
      )}
      {!error && notices.length > 0 && (
        <div className="grid">
          {notices.map((notice) => <NoticeCard key={notice._id} notice={notice} />)}
        </div>
      )}
    </div>
  );
}
