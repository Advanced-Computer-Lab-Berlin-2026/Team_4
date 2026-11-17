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

export default function PaymentMethodPicker({ amountMinor, methods = ['wallet', 'card'], value, onChange, disabled = false, name }) {
  const id = useId();
  const groupName = name || `payment-method-${id}`;
  const [balanceMinor, setBalanceMinor] = useState(null);
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    let ignore = false;
    getWallet().then((w) => { if (!ignore) setBalanceMinor(w.balanceMinor); }).catch(() => { if (!ignore) setBalanceMinor(null); });
    getPolicy().then((p) => { if (!ignore) setPolicy(p.policy); }).catch(() => {});
    return () => { ignore = true; };
  }, []);

  const walletTooLow = balanceMinor !== null && balanceMinor < amountMinor;
  const options = [
    methods.includes('wallet') && {
      value: 'wallet',
      label: 'Wallet',
      hint: balanceMinor === null ? 'Checking your balance…'
        : walletTooLow ? `Not enough balance (you have ${egp(balanceMinor)})` : `Balance ${egp(balanceMinor)}`,
      unavailable: walletTooLow,
    },
    methods.includes('card') && { value: 'card', label: 'Card', hint: 'Paid on Stripe’s secure page. Card details never reach ShareShed.' },
  ].filter(Boolean);

  // If the selected option becomes unavailable (balance loaded and too low), move to the next usable one.
  useEffect(() => {
    const selected = options.find((o) => o.value === value);
    if (selected?.unavailable) onChange?.(options.find((o) => !o.unavailable)?.value || '');
  }, [walletTooLow]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {policy && (
        <p className={styles.meta}>
          Free cancellation up to {policy.cancellation.freeCancellationHours} hours before pickup;
          after that, {policy.cancellation.partialRefundPercent}% of the deposit is refunded to your wallet.
          A delivery fee is always refunded in full if you cancel before the delivery.
          Late returns cost {policy.lateFee.percentOfDepositPerDay}% of the deposit per day
          (up to {policy.lateFee.capPercentOfDeposit}% of it).
        </p>
      )}
    </fieldset>
  );
}
