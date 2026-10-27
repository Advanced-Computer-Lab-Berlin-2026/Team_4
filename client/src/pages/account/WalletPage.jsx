// MY WALLET - Owner: Member 2 - Requirements: 36
// Route: /account/wallet   Access: member   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
import { useEffect, useState } from 'react';
import { getWallet } from '../../api/account.api';
import { getErrorMessage } from '../../api/axios';
import { formatMoney } from '../../utils/format';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import '../../components/account/account.css';

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch fresh from the server: the balance can change (refunds, deposits) after login.
    getWallet().then(setWallet).catch((err) => setError(getErrorMessage(err)));
  }, []);

  return <div className="container"><section className="card form-card"><div className="card-body">
    <h1>My wallet</h1>
    <Alert variant="error">{error}</Alert>
    {!wallet && !error && <Spinner />}
    {wallet && <>
      <p className="muted">Available balance</p>
      <p className="wallet-balance">{formatMoney(wallet.balance)}</p>
      <p className="muted">Refunds and returned deposits are added to your wallet and can be used for future reservations.</p>
    </>}
  </div></section></div>;
}
