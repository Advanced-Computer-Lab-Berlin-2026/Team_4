// <Alert variant="error|success|info">message</Alert>   - renders nothing when there are no children
export default function Alert({ variant = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert-${variant}`} role={variant === 'error' ? 'alert' : 'status'}>{children}</div>;
}
