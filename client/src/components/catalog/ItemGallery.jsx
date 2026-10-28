// ItemGallery - Owner: Member 7 - Requirements: 20
// Props: { photos } — photo gallery for details page (large image + thumbnails)
import { useEffect, useState } from 'react';
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
        <img src={current.url} alt={photos.length ? `${title}, photo ${index + 1} of ${list.length}` : `${title} (no photo)`} />
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
