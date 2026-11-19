// FavoriteButton - Owner: Member 9 - Requirements: 37, 38
// Props: { itemId } - renders null for guests/admins
import { useEffect, useState } from 'react';
import Icon from '../common/Icon';
import useFeedback from '../feedback/useFeedback';
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
  const { toast } = useFeedback();
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
        toast('Removed from your favorites.');
      } else {
        await addFavorite(itemId);
        setIsFavorite(true);
        toast('Added to your favorites.');
      }
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="favorite-toggle"
        onClick={toggleFavorite}
        disabled={loading || busy}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={isFavorite}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-busy={loading || busy}
      >
        <Icon name="heart" size={18} filled={isFavorite} />
      </button>
      {error && <span role="alert" className="field-error">{error}</span>}
    </>
  );
}
