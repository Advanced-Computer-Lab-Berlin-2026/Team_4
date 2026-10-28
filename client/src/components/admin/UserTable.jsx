// UserTable component - Owner: Member 4
import React from 'react';

export default function UserTable({ users, onToggleStatus, onDelete, onViewDetails, busy = false, currentUserId }) {
  return (
      <div className="table-responsive" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
          <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
            <th style={{ padding: '12px' }}>Name</th>
            <th style={{ padding: '12px' }}>Username</th>
            <th style={{ padding: '12px' }}>Email</th>
            <th style={{ padding: '12px' }}>Role</th>
            <th style={{ padding: '12px' }}>Verification Status</th>
            <th style={{ padding: '12px' }}>Account Status</th>
            <th style={{ padding: '12px' }}>Actions</th>
          </tr>
          </thead>
          <tbody>
          {users.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>No users found.</td></tr>
          ) : (
              users.map((user) => (
                  <tr key={user._id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '12px' }}>{user.name}</td>
                    <td style={{ padding: '12px' }}>{user.username}</td>
                    <td style={{ padding: '12px' }}>{user.email}</td>
                    <td style={{ padding: '12px' }}>{user.role}</td>
                    <td style={{ padding: '12px' }}>
                  <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', background: user.lenderStatus === 'verified' ? '#d4edda' : '#fff3cd', color: user.lenderStatus === 'verified' ? '#155724' : '#856404' }}>
                    {user.lenderStatus || 'Standard'}
                  </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                  <span style={{ fontWeight: 'bold', color: user.status === 'suspended' ? 'red' : 'green' }}>
                    {user.status || 'active'}
                  </span>
                    </td>
                    <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                      <button
                          type="button"
                          disabled={busy}
                          onClick={() => onViewDetails(user)}
                          style={{ padding: '4px 8px', background: '#17a2b8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        View
                      </button>
                      <button
                          type="button"
                          disabled={busy || user.role === 'admin'}
                          onClick={() => onToggleStatus(user._id, user.status)}
                          style={{ padding: '4px 8px', background: user.status === 'suspended' ? '#28a745' : '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        {user.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                      </button>
                      <button
                          type="button"
                          disabled={busy || user._id === currentUserId}
                          onClick={() => onDelete(user._id)}
                          style={{ padding: '4px 8px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
              ))
          )}
          </tbody>
        </table>
      </div>
  );
}