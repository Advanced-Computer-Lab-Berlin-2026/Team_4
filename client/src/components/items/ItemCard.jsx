// FOUNDATION - the ONE item card used by Catalog (M7), Category page (M9), Favorites (M9), My Items (M5).
// Do not fork it. Need an extra button? Pass it via the `actions` prop.
//   <ItemCard item={item} actions={<button>...</button>} />
// item shape: { _id, title, photos:[{url}], category:{_id,name,slug}, depositAmount, owner?:{name} }
import { Link } from 'react-router-dom';
import { formatMoney } from '../../utils/format';
import FavoriteButton from '../favorites/FavoriteButton';

export default function ItemCard({ item, actions, to }) {
  const photo = item.photos?.[0]?.url || '/uploads/placeholder.svg';
  return (
    <article className="card item-card">
      <div className="item-card-media">
        <Link to={to || `/catalog/${item._id}`}><img src={photo} alt={item.title} loading="lazy" /></Link>
        <div className="item-card-fav"><FavoriteButton itemId={item._id} /></div>
      </div>
      <div className="card-body">
        <h3 className="item-card-title"><Link to={to || `/catalog/${item._id}`}>{item.title}</Link></h3>
        {item.category?.name && <div className="muted">{item.category.name}</div>}
        <div className="item-card-deposit">Deposit: <strong>{formatMoney(item.depositAmount)}</strong></div>
        {actions && <div className="item-card-actions">{actions}</div>}
      </div>
    </article>
  );
}
