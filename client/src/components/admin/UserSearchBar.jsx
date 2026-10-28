// UserSearchBar - Owner: Member 4 - Requirements: 28
// Props: { value, onChange } — name search + filters for the users table
import React from 'react';

export default function UserSearchBar({ value = {}, onChange }) {
  const handleInputChange = (field, val) => {
    if (typeof onChange === 'function') {
      onChange({ ...value, [field]: val });
    }
  };

  return (
      <div className="user-search-bar" style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {/* Name / Username Search */}
        <input
            type="text"
            placeholder="Search by name, username, or email..."
            value={value.q || ''}
            onChange={(e) => handleInputChange('q', e.target.value)}
            style={{ padding: '8px 12px', flex: '1 1 250px', borderRadius: '4px', border: '1px solid #ccc' }}
        />

        {/* Role Filter */}
        <select
            value={value.role || ''}
            onChange={(e) => handleInputChange('role', e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">All Roles</option>
          <option value="member">Member</option>
          <option value="lender">Lender</option>
          <option value="admin">Admin</option>
        </select>

        {/* Lender Status Filter */}
        <select
            value={value.lenderStatus || ''}
            onChange={(e) => handleInputChange('lenderStatus', e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">All Lender Statuses</option>
          <option value="verified">Verified Lender</option>
          <option value="pending">Pending</option>
          <option value="unverified">Unverified</option>
        </select>

        {/* Account Status Filter */}
        <select
            value={value.status || ''}
            onChange={(e) => handleInputChange('status', e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">All Account Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>

        {/* Reset Filters Button */}
        <button
            type="button"
            onClick={() => {
              if (typeof onChange === 'function') {
                onChange({ q: '', role: '', lenderStatus: '', status: '' });
              }
            }}
            style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Reset
        </button>
      </div>
  );
}