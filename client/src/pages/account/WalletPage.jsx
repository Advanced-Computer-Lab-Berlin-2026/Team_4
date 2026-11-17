// MY WALLET - Owner: Member 2 - Requirements: 36, 78
// Route: /account/wallet   Access: member   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// Shows the balance, any late fees still owed, and the full wallet history (Sprint 2).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWallet } from '../../api/account.api';
import { getErrorMessage } from '../../api/axios';
import { formatMoney } from '../../utils/format';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import WalletLedger from '../../components/sprint2/m2/WalletLedger';
import styles from '../../styles/sprint2/member2.module.css';

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch fresh from the server: the balance can change (refunds, deposits) after login.
    getWallet().then(setWallet).catch((err) => setError(getErrorMessage(err)));
  }, []);

  return <div className="container"><div className={styles.page}>
    <section className="card"><div className="card-body">
      <div className={styles.header}>
        <h1>My wallet</h1>
        <Link to="/account/late-fees">View late fees</Link>
      </div>
      <Alert variant="error">{error}</Alert>
      {!wallet && !error && <Spinner />}
      {wallet && <>
        <p className="muted">Available balance</p>
        <p className={styles.balance}>{formatMoney(wallet.balanceMinor / 100)}</p>
        {wallet.outstandingLateFeesMinor > 0 && (
          <Alert variant="error">
            You still owe {formatMoney(wallet.outstandingLateFeesMinor / 100)} in late fees.
            It will be taken automatically from your next wallet credit. <Link to="/account/late-fees">See details</Link>
          </Alert>
        )}
        <p className="muted">Refunds and returned deposits are added to your wallet and can be used for future reservations.</p>
      </>}
    </div></section>
    <WalletLedger />
  </div></div>;
}
