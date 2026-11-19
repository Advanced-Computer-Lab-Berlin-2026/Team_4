import { Link } from 'react-router-dom';
import { formatMoney } from '../../utils/format';
import Icon from '../common/Icon';
import categoryIcon from '../catalog/categoryIcon';
import FavoriteButton from '../favorites/FavoriteButton';

export default function ItemCard({ item, actions, to }) {
  const photo = item.photos?.[0]?.url;
  const itemPath = to || '/catalog/' + item._id;

  return (
    <article className="card item-card">
      <div className="item-card-media">
        <Link to={itemPath} aria-label={item.title}>
          {photo && photo !== '/uploads/placeholder.svg' ? <img src={photo} alt="" loading="lazy" />
            : <div className="item-card-placeholder" aria-hidden="true"><Icon name={categoryIcon(item.category?.slug)} size={66} /></div>}
        </Link>
        <div className="item-card-fav"><FavoriteButton itemId={item._id} /></div>
      </div>
      <div className="card-body">
        {item.category?.name && <p className="item-card-category">{item.category.name}</p>}
        <h3 className="item-card-title"><Link to={itemPath}>{item.title}</Link></h3>
        <div className="item-card-deposit"><span>Deposit</span><strong>{formatMoney(item.depositAmount)}</strong></div>
        {actions && <div className="item-card-actions">{actions}</div>}
      </div>
    </article>
  );
}
