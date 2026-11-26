import styles from '../../../styles/sprint2/member1.module.css';

const money = (minor, currency) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency,
}).format(minor / 100);

function DepositBreakdown({ line, quote }) {
  const { base, categoryMultiplier = 1, tierDiscountPercent = 0, promoDiscount = 0, amount } = line.deposit;
  const price = (minor) => money(minor, quote.currency);
  const depositMinor = Math.round(amount * 100);
  const promoMinor = Math.round(promoDiscount * 100);
  const hasBase = Number.isFinite(base);
  const hasMultiplier = hasBase && categoryMultiplier !== 1;
  const hasMembershipDiscount = tierDiscountPercent > 0;
  const adjusted = hasMultiplier || hasMembershipDiscount || promoMinor > 0;
  const { tierName, source } = quote.membershipDiscount || {};
  const discountLabel = source === 'household' ? 'Household membership discount' : 'Membership discount';

  return (
    <dl className={styles.depositBreakdown}>
      {adjusted && hasBase && <div><dt>Item deposit</dt><dd>{price(Math.round(base * 100))}</dd></div>}
      {hasMultiplier && (
        <div><dt>Category multiplier</dt><dd>×{categoryMultiplier} → {price(Math.round(base * categoryMultiplier * 100))}</dd></div>
      )}
      {hasMembershipDiscount && (
        <div>
          <dt>{discountLabel}{tierName && ` (${tierName})`}</dt>
          <dd>−{tierDiscountPercent}% → {price(depositMinor + promoMinor)}</dd>
        </div>
      )}
      {promoMinor > 0 && <div><dt>Promo discount</dt><dd>−{price(promoMinor)}</dd></div>}
      <div><dt>{adjusted ? 'Final deposit' : 'Deposit'}</dt><dd>{price(depositMinor)}</dd></div>
      {line.fulfilment.method === 'delivery' && (
        <div><dt>Delivery fee</dt><dd>{price(Math.round(line.fulfilment.deliveryFee * 100))}</dd></div>
      )}
    </dl>
  );
}

export default function CheckoutSummary({ quote }) {
  return (
    <>
      <h2>Reservation summary</h2>
      <ul className={styles.summaryList}>{quote.lines.map((line) => (
        <li key={line.entryId ?? (line.itemId + ':' + line.startDate)}>
          <strong>{line.title}</strong>
          <div>{line.startDate.slice(0, 10)} to {line.endDate.slice(0, 10)}</div>
          <DepositBreakdown line={line} quote={quote} />
        </li>
      ))}</ul>
      <p className={styles.checkoutTotal}><strong>Total</strong><strong>{money(quote.amountMinor, quote.currency)}</strong></p>
    </>
  );
}
