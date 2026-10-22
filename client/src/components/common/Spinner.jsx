export default function Spinner({ label = 'Loading...' }) {
  return <div className="spinner" role="status" aria-live="polite">{label}</div>;
}
