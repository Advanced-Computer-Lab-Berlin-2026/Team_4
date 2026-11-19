// SearchBar - Owner: Member 7 - Requirements: 17
// Props: { value, onSubmit } — search by name. onSubmit(text) is called with the trimmed text ('' clears).
import { useEffect, useState } from 'react';
import Icon from '../common/Icon';
import './catalog.css';

export default function SearchBar({ value = '', onSubmit }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]); // stay in sync with the URL (back button, clear)

  const submit = (e) => {
    e.preventDefault();
    onSubmit?.(text.trim());
  };
  const clear = () => { setText(''); onSubmit?.(''); };

  return (
    <form className="catalog-search" role="search" onSubmit={submit}>
      <span className="catalog-search-icon"><Icon name="search" size={19} /></span>
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Find items"
        aria-label="Search items by name"
        maxLength={100}
      />
      <button type="submit" className="btn">Search</button>
      {value && <button type="button" className="btn btn-secondary" onClick={clear}>Clear</button>}
    </form>
  );
}
