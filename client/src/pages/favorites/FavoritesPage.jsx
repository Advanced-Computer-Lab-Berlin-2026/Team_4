// MY FAVORITES - Owner: Member 9 - Requirements: 38
// Route: /favorites - Access: member
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { listFavorites, removeFavorite } from '../../api/favorites.api';
import Alert from '../../components/common/Alert';
import ItemCard from '../../components/items/ItemCard';
import Spinner from '../../components/common/Spinner';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removingItemId, setRemovingItemId] = useState('');

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { favorites: savedFavorites } = await listFavorites();
      setFavorites(savedFavorites);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleRemove = async (itemId) => {
    if (!window.confirm('Remove this item from your favorites?')) return;

    setRemovingItemId(itemId);
    setError('');
    setSuccess('');
    try {
      await removeFavorite(itemId);
      setFavorites((current) => current.filter((favorite) => favorite.item?._id !== itemId));
      setSuccess('Item removed from your favorites.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRemovingItemId('');
    }
  };

  if (loading) return <Spinner label="Loading favorites..." />;

  return (
    <div className="container">
      <h1>My favorites</h1>
      <Alert variant="error">{error}</Alert>
      <Alert variant="success">{success}</Alert>

      {error && (
        <button type="button" className="btn btn-secondary" onClick={loadFavorites}>
          Try again
        </button>
      )}

      {favorites.length === 0 && !error ? (
        <div className="center">
          <p className="muted">You have no saved items yet.</p>
          <Link className="btn" to="/catalog">Browse items</Link>
        </div>
      ) : favorites.length > 0 ? (
        <div className="grid">
          {favorites.map(({ _id, item }) => (
            <ItemCard
              key={_id}
              item={item}
              actions={
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={() => handleRemove(item._id)}
                  disabled={removingItemId === item._id}
                >
                  {removingItemId === item._id ? 'Removing...' : 'Remove'}
                </button>
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
