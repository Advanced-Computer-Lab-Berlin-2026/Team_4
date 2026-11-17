import { Navigate, useSearchParams } from 'react-router-dom';

export default function DeliveryCheckoutPage() {
  const [params] = useSearchParams();
  if (params.get('source') === 'borrowList') return <Navigate to="/checkout" replace />;
  const itemId = params.get('itemId');
  return <Navigate to={itemId ? '/reserve/' + encodeURIComponent(itemId) : '/reserve'} replace />;
}
