// FavoriteButton - Owner: Member 9 - Requirements: 37, 38
// Props: { itemId } - renders null for guests/admins
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api/axios';
import { addFavorite, listFavoriteIds, removeFavorite } from '../../api/favorites.api';

const favoriteIdRequests = new Map();

function loadFavoriteIds(userId) {
  if (!favoriteIdRequests.has(userId)) {
    const request = listFavoriteIds().then(({ ids }) => new Set(ids));
    favoriteIdRequests.set(userId, request);
    request.then(
      () => favoriteIdRequests.delete(userId),
      () => favoriteIdRequests.delete(userId)
    );
  }
  return favoriteIdRequests.get(userId);
}

export default function FavoriteButton({ itemId }) {
  const { user, isMember } = useAuth();
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isMember || !user?._id) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError('');
    loadFavoriteIds(user._id)
      .then((ids) => {
        if (active) setIsFavorite(ids.has(itemId));
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [itemId, isMember, user?._id]);

  if (!isMember) return null;

  const toggleFavorite = async () => {
    setBusy(true);
    setError('');
    try {
      if (isFavorite) {
        await removeFavorite(itemId);
        setIsFavorite(false);
      } else {
        await addFavorite(itemId);
        setIsFavorite(true);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        onClick={toggleFavorite}
        disabled={loading || busy}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={isFavorite}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-busy={loading || busy}
      >
        {isFavorite ? '\u2665' : '\u2661'}
      </button>
      {error && <span role="alert" className="field-error">{error}</span>}
    </>
  );
}
