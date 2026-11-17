import styles from '../../../styles/sprint2/member1.module.css';

const money = (minor, currency) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency,
}).format(minor / 100);

export default function CheckoutSummary({ quote }) {
  return (
    <>
      <h2>Reservation summary</h2>
      <ul className={styles.list}>{quote.lines.map((line) => (
        <li key={line.entryId ?? (line.itemId + ':' + line.startDate)}>
          <strong>{line.title}</strong>
          <div>{line.startDate.slice(0, 10)} to {line.endDate.slice(0, 10)}</div>
          <div>Deposit {money(Math.round(line.deposit.amount * 100), quote.currency)}</div>
          {line.deposit.promoDiscount > 0 && (
            <div>Promo discount {money(Math.round(line.deposit.promoDiscount * 100), quote.currency)}</div>
          )}
          {line.fulfilment.method === 'delivery' && (
            <div>Delivery {money(Math.round(line.fulfilment.deliveryFee * 100), quote.currency)}</div>
          )}
        </li>
      ))}</ul>
      <p><strong>Total {money(quote.amountMinor, quote.currency)}</strong></p>
    </>
  );
}
