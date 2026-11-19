// UserSearchBar - Owner: Member 4 - Requirements: 28
// Props: { value, onChange } — name search + filters for the users table

export default function UserSearchBar({ value = {}, onChange }) {
  const handleInputChange = (field, val) => {
    if (typeof onChange === 'function') {
      onChange({ ...value, [field]: val });
    }
  };

  return (
      <div className="admin-user-search">
        {/* Name / Username Search */}
        <input
            type="text"
            aria-label="Search users"
            maxLength={100}
            placeholder="Search by name, username, or email..."
            value={value.q || ''}
            onChange={(e) => handleInputChange('q', e.target.value)}
        />

        {/* Role Filter */}
        <select
            aria-label="Role"
            value={value.role || ''}
            onChange={(e) => handleInputChange('role', e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="member">Member</option>
          <option value="lender">Lender</option>
          <option value="admin">Admin</option>
        </select>

        {/* Lender Status Filter */}
        <select
            aria-label="Lender status"
            value={value.lenderStatus || ''}
            onChange={(e) => handleInputChange('lenderStatus', e.target.value)}
        >
          <option value="">All Lender Statuses</option>
          <option value="verified">Verified Lender</option>
          <option value="pending">Pending</option>
          <option value="none">Not applied</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Account Status Filter */}
        <select
            aria-label="Account status"
            value={value.status || ''}
            onChange={(e) => handleInputChange('status', e.target.value)}
        >
          <option value="">All Account Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>

        {/* Reset Filters Button */}
        <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              if (typeof onChange === 'function') {
                onChange({ q: '', role: '', lenderStatus: '', status: '' });
              }
            }}
        >
          Reset
        </button>
      </div>
  );
}