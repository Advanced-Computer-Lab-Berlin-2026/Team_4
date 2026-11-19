// CATEGORIES & DEPOSIT MULTIPLIERS - Owner: Member 6 - Requirements: 40
// Route: /admin/categories   Access: admin   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// API calls: src/api/*.api.js   Shared UI: src/components/common/*
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { listCategories, setDepositMultiplier } from '../../api/categories.api';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import { hasSprint2Routes, promoCodesPath, promoUsagePath } from '../../components/sprint2/m6/routesAvailability';

const PromoCodesPage = lazy(() => import('./AdminPromoCodesPage'));
const PromoUsagePage = lazy(() => import('./AdminPromoUsagePage'));

export default function AdminCategoriesPage() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  if (!hasSprint2Routes && (tab === 'promo-codes' || tab === 'promo-usage')) {
    return <Suspense fallback={<Spinner />}>
      {tab === 'promo-codes' ? <PromoCodesPage /> : <PromoUsagePage />}
    </Suspense>;
  }
  return <Categories />;
}

function Categories() {
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setLoading(true);
    listCategories()
      .then((data) => {
        const nextCategories = data.categories || [];
        setCategories(nextCategories);
        setDrafts(Object.fromEntries(nextCategories.map((category) => [category._id, category.depositMultiplier ?? 1])));
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const updateDraft = (id, value) => {
    setDrafts((current) => ({ ...current, [id]: value }));
  };

  const saveMultiplier = async (category) => {
    const depositMultiplier = Number(drafts[category._id]);
    setError('');
    setSuccess('');

    if (!Number.isFinite(depositMultiplier) || depositMultiplier < 1 || depositMultiplier > 10) {
      setError('Deposit multiplier must be a number from 1 to 10.');
      return;
    }

    setSavingId(category._id);
    try {
      const data = await setDepositMultiplier(category._id, { depositMultiplier });
      setCategories((current) => current.map((item) => (item._id === data.category._id ? data.category : item)));
      setDrafts((current) => ({ ...current, [data.category._id]: data.category.depositMultiplier }));
      setSuccess(`${data.category.name} multiplier saved.`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="container">
      <h1>Categories and deposit multipliers</h1>
      <p className="muted">Adjust the multiplier used when deposits are calculated for each item category.</p>
      <p><Link to={promoCodesPath}>Promo codes</Link> · <Link to={promoUsagePath}>Promo usage and redemptions</Link></p>
      <Alert variant="error">{error}</Alert>
      <Alert variant="success">{success}</Alert>

      {loading && <Spinner label="Loading categories..." />}
      {!loading && categories.length === 0 && <p className="muted">No active categories are available.</p>}
      {!loading && categories.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Multiplier</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category._id}>
                  <td>
                    <strong>{category.name}</strong>
                    <div className="muted">{category.slug}</div>
                  </td>
                  <td>{category.description || <span className="muted">No description</span>}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      step="0.05"
                      value={drafts[category._id] ?? 1}
                      aria-label={`${category.name} deposit multiplier`}
                      onChange={(event) => updateDraft(category._id, event.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      className="btn btn-small"
                      type="button"
                      disabled={savingId === category._id}
                      onClick={() => saveMultiplier(category)}
                    >
                      {savingId === category._id ? 'Saving...' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
