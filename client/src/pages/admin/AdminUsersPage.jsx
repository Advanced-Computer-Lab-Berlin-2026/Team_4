// AdminUsersPage page - Owner: Member 4
import React, { useEffect, useState } from 'react';
import { listUsers, setUserStatus, removeUser, getUser } from '../../api/adminUsers.api';
import UserSearchBar from '../../components/admin/UserSearchBar';
import UserTable from '../../components/admin/UserTable';

export default function AdminUsersPage() {
    const [searchParams, setSearchParams] = useState({ q: '', role: '', lenderStatus: '', status: '' });
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);

    const loadUsers = async (params = {}) => {
        setLoading(true);
        setError('');
        try {
            const cleanedParams = Object.fromEntries(
                Object.entries(params).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
            );
            const res = await listUsers(cleanedParams);
            let userData = [];
            if (Array.isArray(res)) {
                userData = res;
            } else if (res && Array.isArray(res.data)) {
                userData = res.data;
            } else if (res && res.data && Array.isArray(res.data.data)) {
                userData = res.data.data;
            }
            setUsers(userData);
        } catch (err) {
            console.error('Failed to load users:', err);
            setError('Failed to load registered users.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers(searchParams);
    }, [searchParams]);

    const handleToggleStatus = async (userId, currentStatus) => {
        const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
        try {
            await setUserStatus(userId, { status: newStatus });
            setUsers(users.map(u => u._id === userId ? { ...u, status: newStatus } : u));
        } catch (err) {
            alert('Failed to update user account status.');
        }
    };

    const handleDelete = async (userId) => {
        if (!window.confirm('Are you sure you want to remove this user?')) return;
        try {
            await removeUser(userId);
            setUsers(users.filter(u => u._id !== userId));
        } catch (err) {
            alert('Failed to remove user.');
        }
    };

    const handleViewDetails = async (user) => {
        setSelectedUser(user); // instant display
        try {
            const res = await getUser(user._id);
            if (res && res.data) {
                setSelectedUser(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch individual user details, using table data cache.');
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <h2>Admin User Management</h2>
            <UserSearchBar value={searchParams} onChange={setSearchParams} />

            {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}

            {loading ? (
                <p style={{ marginTop: '1rem' }}>Loading registered users...</p>
            ) : (
                <div style={{ marginTop: '1.5rem' }}>
                    <UserTable
                        users={users}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDelete}
                        onViewDetails={handleViewDetails}
                    />
                </div>
            )}

            {/* Modal Overlay */}
            {selectedUser && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
                    justifyContent: 'center', alignItems: 'center', zIndex: 9999
                }}>
                    <div style={{
                        background: '#ffffff', padding: '2rem', borderRadius: '8px',
                        width: '450px', maxWidth: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                    }}>
                        <h3>User Basic Information</h3>
                        <hr style={{ margin: '1rem 0', border: '0', borderTop: '1px solid #eee' }} />
                        <p><strong>Full Name:</strong> {selectedUser.name}</p>
                        <p><strong>Username:</strong> {selectedUser.username}</p>
                        <p><strong>Email:</strong> {selectedUser.email}</p>
                        <p><strong>Phone:</strong> {selectedUser.phone || 'N/A'}</p>
                        <p><strong>Address:</strong> {selectedUser.address || 'N/A'}</p>
                        <p><strong>Role:</strong> {selectedUser.role}</p>
                        <p><strong>Lender Status:</strong> {selectedUser.lenderStatus || 'Standard'}</p>
                        <p><strong>Account Status:</strong> <span style={{ color: selectedUser.status === 'suspended' ? 'red' : 'green', fontWeight: 'bold' }}>{selectedUser.status || 'active'}</span></p>
                        <p><strong>Registered On:</strong> {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : 'N/A'}</p>

                        <button
                            type="button"
                            onClick={() => setSelectedUser(null)}
                            style={{ marginTop: '1.5rem', padding: '0.6rem 1rem', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}