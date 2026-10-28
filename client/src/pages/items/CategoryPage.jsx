// CATEGORY - Owner: Member 9 - Requirements: 34
// Route: /categories/:slug - Access: public
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { listItems } from '../../api/catalog.api';
import { getCategory } from '../../api/categories.api';
import { getErrorMessage } from '../../api/axios';
import Alert from '../../components/common/Alert';
import ItemCard from '../../components/items/ItemCard';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';

export default function CategoryPage() {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadCategoryItems = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const { category: loadedCategory } = await getCategory(slug);
      const data = await listItems({ category: loadedCategory._id, page, limit: 12 });
      if (requestId.current !== currentRequest) return;
      setCategory(loadedCategory);
      setResult(data);
    } catch (err) {
      if (requestId.current === currentRequest) setError(getErrorMessage(err));
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [page, slug]);

  useEffect(() => {
    setPage(1);
  }, [slug]);

  useEffect(() => {
    loadCategoryItems();
  }, [loadCategoryItems]);

  if (loading) return <Spinner label="Loading category items..." />;

  return (
    <div className="container">
      <h1>{category?.name || 'Category'}</h1>
      {category?.description && <p className="muted">{category.description}</p>}
      <Alert variant="error">{error}</Alert>
      {error && (
        <button type="button" className="btn btn-secondary" onClick={loadCategoryItems}>
          Try again
        </button>
      )}
      {!error && result.items.length === 0 && (
        <p className="muted">There are no items in this category yet.</p>
      )}
      {!error && result.items.length > 0 && (
        <>
          <p className="muted">{result.total} item{result.total === 1 ? '' : 's'}</p>
          <div className="grid">
            {result.items.map((item) => <ItemCard key={item._id} item={item} />)}
          </div>
          <Pagination page={result.page} pages={result.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
