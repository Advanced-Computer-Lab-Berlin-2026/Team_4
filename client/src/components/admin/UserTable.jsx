import StatusBadge from '../common/StatusBadge';

export default function UserTable({ users, onToggleStatus, onDelete, onViewDetails, busy = false, currentUserId }) {
  return (
    <div className="card table-wrap">
      <table aria-label="Users">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Username</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Verification status</th>
            <th scope="col">Account status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && <tr><td colSpan={7}>No users found.</td></tr>}
          {users.map((user) => (
            <tr key={user._id}>
              <td><strong>{user.name}</strong></td>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td><StatusBadge status={user.lenderStatus || 'Standard'} /></td>
              <td><StatusBadge status={user.status || 'active'} /></td>
              <td>
                <div className="admin-user-actions">
                  <button type="button" className="btn btn-small btn-secondary" disabled={busy} onClick={() => onViewDetails(user)}>View</button>
                  <button type="button" className="btn btn-small btn-secondary" disabled={busy || user.role === 'admin'}
                    onClick={() => onToggleStatus(user._id, user.status)}>
                    {user.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                  </button>
                  <button type="button" className="btn btn-small btn-danger" disabled={busy || user._id === currentUserId}
                    onClick={() => onDelete(user._id)}>Remove</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
