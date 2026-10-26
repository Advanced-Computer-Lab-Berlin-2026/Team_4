export default function AuthFormLayout({ title, children }) {
  return <div className="container"><section className="card form-card"><div className="card-body">
    <h1>{title}</h1>{children}
  </div></section></div>;
}
