// ItemGallery - Owner: Member 7 - Requirements: 20
// Props: { photos } — photo gallery for details page (large image + thumbnails)
import { useEffect, useState } from 'react';
import Icon from '../common/Icon';
import './catalog.css';

const PLACEHOLDER = '/uploads/placeholder.svg';

export default function ItemGallery({ photos = [], title = 'Item' }) {
  const list = photos.length ? photos : [{ url: PLACEHOLDER }];
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [photos]);
  const current = list[Math.min(index, list.length - 1)];

  return (
    <section className="catalog-gallery" aria-label="Item photos">
      <div className="catalog-gallery-main">
        {current.url === PLACEHOLDER
          ? <div className="gallery-placeholder" role="img" aria-label={title + ' (no photo)'}><Icon name="tool" size={72} /></div>
          : <img src={current.url} alt={title + ', photo ' + (index + 1) + ' of ' + list.length} />}
      </div>
      {list.length > 1 && (
        <div className="catalog-gallery-thumbs">
          {list.map((p, i) => (
            <button
              key={p._id || p.url}
              type="button"
              className="catalog-thumb"
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            >
              <img src={p.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
