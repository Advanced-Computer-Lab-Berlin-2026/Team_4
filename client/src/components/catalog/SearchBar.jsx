// SearchBar - Owner: Member 7 - Requirements: 17
// Props: { value, onSubmit } — search by name. onSubmit(text) is called with the trimmed text ('' clears).
import { useEffect, useState } from 'react';
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
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search items by name"
        aria-label="Search items by name"
        maxLength={100}
      />
      <button type="submit" className="btn">Search</button>
      {value && <button type="button" className="btn btn-secondary" onClick={clear}>Clear</button>}
    </form>
  );
}
