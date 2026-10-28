// AdminUserDetailPage page - Owner: Member 4
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUser } from '../../api/adminUsers.api';

export default function AdminUserDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadDetails = async () => {
            try {
                const res = await getUser(id);
                setUser(res.data);
            } catch (err) {
                setError('Failed to fetch user details.');
            } finally {
                setLoading(false);
            }
        };
        loadDetails();
    }, [id]);

    if (loading) return <div style={{ padding: '2rem' }}>Loading user details...</div>;
    if (error) return <div style={{ padding: '2rem', color: 'red' }}>{error}</div>;
    if (!user) return <div style={{ padding: '2rem' }}>User not found.</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <button
                onClick={() => navigate(-1)}
                style={{ marginBottom: '1.5rem', padding: '6px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
                &larr; Back
            </button>

            <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h2>User Basic Information</h2>
                <hr style={{ margin: '1rem 0', border: '0', borderTop: '1px solid #eee' }} />

                <p><strong>Full Name:</strong> {user.name}</p>
                <p><strong>Username:</strong> {user.username}</p>
                <p><strong>Email Address:</strong> {user.email}</p>
                <p><strong>Phone Number:</strong> {user.phone || 'N/A'}</p>
                <p><strong>Home Address:</strong> {user.address || 'N/A'}</p>
                <p><strong>System Role:</strong> {user.role}</p>
                <p><strong>Lender Status:</strong> {user.lenderStatus || 'Standard'}</p>
                <p><strong>Account Status:</strong> <span style={{ color: user.status === 'suspended' ? 'red' : 'green', fontWeight: 'bold' }}>{user.status || 'active'}</span></p>
                <p><strong>Registered On:</strong> {new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
        </div>
    );
}