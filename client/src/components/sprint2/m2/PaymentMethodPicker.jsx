// PaymentMethodPicker - Owner: Member 2 - Requirements: 50 (choose wallet or card), 77/81 (rules shown before paying)
// Props: { amountMinor, methods = ['wallet','card'], value, onChange, disabled, name }
//   amountMinor - total from the SERVER quote (display only; the server charges its own quote again)
//   methods     - what the server offers, e.g. quote.paymentMethods from M1's checkout
// Shows the wallet balance, disables "Wallet" when it is too low, and summarises the refund/late-fee policy.
// Used by M1 CheckoutPage and M8 membership: <PaymentMethodPicker amountMinor={q.amountMinor}
//   methods={q.paymentMethods} value={method} onChange={setMethod} disabled={submitting} />
import { useEffect, useId, useState } from 'react';
import { getWallet } from '../../../api/account.api';
import { getPolicy } from '../../../api/payments.api';
import { formatMoney } from '../../../utils/format';
import styles from '../../../styles/sprint2/member2.module.css';

const egp = (minor) => formatMoney(minor / 100);

export default function PaymentMethodPicker({ amountMinor, methods = ['wallet', 'card'], value, onChange, disabled = false, name, showReservationPolicy = true }) {
  const id = useId();
  const groupName = name || `payment-method-${id}`;
  const hasWallet = methods.includes('wallet');
  const hasCard = methods.includes('card');
  const needsPolicy = showReservationPolicy && (hasWallet || hasCard);
  const [balanceMinor, setBalanceMinor] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [walletFailed, setWalletFailed] = useState(false);
  const [policyFailed, setPolicyFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasWallet) return;
    let ignore = false;
    setWalletFailed(false);
    setBalanceMinor(null);
    getWallet()
      .then(({ balanceMinor: balance }) => {
        if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid wallet balance');
        if (!ignore) setBalanceMinor(balance);
      })
      .catch(() => { if (!ignore) setWalletFailed(true); });
    return () => { ignore = true; };
  }, [hasWallet, attempt]);

  useEffect(() => {
    if (!needsPolicy) return;
    let ignore = false;
    setPolicyFailed(false);
    getPolicy()
      .then(({ policy: rules }) => {
        if (!rules?.cancellation || !rules?.lateFee) throw new Error('Invalid payment policy');
        if (!ignore) setPolicy(rules);
      })
      .catch(() => { if (!ignore) setPolicyFailed(true); });
    return () => { ignore = true; };
  }, [needsPolicy, attempt]);

  const walletTooLow = balanceMinor !== null && balanceMinor < amountMinor;
  const walletUnavailable = walletFailed || walletTooLow;
  const options = [
    hasWallet && {
      value: 'wallet',
      label: 'Wallet',
      hint: walletFailed ? 'Wallet balance unavailable.'
        : balanceMinor === null ? 'Checking your balance…'
        : walletTooLow ? `Not enough balance (you have ${egp(balanceMinor)})` : `Balance ${egp(balanceMinor)}`,
      unavailable: walletUnavailable,
    },
    hasCard && { value: 'card', label: 'Card', hint: 'Paid on Stripe’s secure page. Card details never reach ShareShed.' },
  ].filter(Boolean);

  useEffect(() => {
    if (hasWallet && walletUnavailable && value === 'wallet') onChange?.(hasCard ? 'card' : '');
  }, [hasWallet, hasCard, walletUnavailable, value, onChange]);

  if (!options.length) return <p role="status">Payment is temporarily unavailable.</p>;

  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend>Pay {egp(amountMinor)} with</legend>
      {options.map((option) => (
        <label key={option.value} className={`${styles.option} ${option.unavailable ? styles.optionDisabled : ''}`}>
          <input
            type="radio" name={groupName} value={option.value} checked={value === option.value}
            disabled={option.unavailable} onChange={() => onChange?.(option.value)}
            aria-describedby={`${id}-${option.value}-hint`}
          />
          <span>
            <span className={styles.title}>{option.label}</span>
            <span id={`${id}-${option.value}-hint`} className={styles.meta}> {option.hint}</span>
          </span>
        </label>
      ))}
      {needsPolicy && policy && !policyFailed && (
        <p className={styles.meta}>
          Free cancellation up to {policy.cancellation.freeCancellationHours} hours before pickup;
          after that, {policy.cancellation.partialRefundPercent}% of the deposit is refunded to your wallet.
          A delivery fee is always refunded in full if you cancel before the delivery.
          Late returns cost {policy.lateFee.percentOfDepositPerDay}% of the deposit per day
          (up to {policy.lateFee.capPercentOfDeposit}% of it).
        </p>
      )}
      {((hasWallet && walletFailed) || (needsPolicy && policyFailed)) && (
        <div>
          <p role="status" className={styles.meta}>
            {hasWallet && walletFailed && 'Could not load your wallet balance. '}
            {needsPolicy && policyFailed && 'Could not load the refund and late-fee policy.'}
          </p>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setAttempt((n) => n + 1)}>
            Retry payment details
          </button>
        </div>
      )}
    </fieldset>
  );
}
