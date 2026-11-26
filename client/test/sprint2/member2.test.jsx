// Member 2 - client tests (Req 50, 51, 78): wallet page, wallet history, late fees and the payment-method picker.
// The API modules are mocked, so these tests check what the borrower SEES and can DO, not the server.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentMethodPicker from '../../src/components/sprint2/m2/PaymentMethodPicker';
import WalletLedger from '../../src/components/sprint2/m2/WalletLedger';
import WalletPage from '../../src/pages/account/WalletPage';
import LateFeesPage from '../../src/pages/account/LateFeesPage';
import member2Routes from '../../src/routes/sprint2/member2.routes';
import { getWallet } from '../../src/api/account.api';
import { getPolicy, getLateFees } from '../../src/api/payments.api';
import { getLedger } from '../../src/api/walletLedger.api';

vi.mock('../../src/api/account.api', () => ({ getWallet: vi.fn() }));
vi.mock('../../src/api/payments.api', () => ({ getPolicy: vi.fn(), getLateFees: vi.fn() }));
vi.mock('../../src/api/walletLedger.api', () => ({ getLedger: vi.fn() }));

const POLICY = { policy: { currency: 'EGP', cancellation: { freeCancellationHours: 48, partialRefundPercent: 50 }, lateFee: { graceMinutes: 0, percentOfDepositPerDay: 10, capPercentOfDeposit: 100 } } };
const page = (items, extra = {}) => ({ items, total: items.length, page: 1, limit: 10, pages: 1, ...extra });
const inRouter = (ui) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PaymentMethodPicker (Req 50, 51)', () => {
  it('shows the balance, lets the borrower choose wallet or card with the keyboard, and states the rules', async () => {
    getWallet.mockResolvedValue({ balanceMinor: 50000 });
    getPolicy.mockResolvedValue(POLICY);
    const onChange = vi.fn();
    render(<PaymentMethodPicker amountMinor={15000} methods={['wallet', 'card']} value="wallet" onChange={onChange} />);

    const group = screen.getByRole('group', { name: /Pay .*150/ });
    expect(await within(group).findByText(/Balance .*500/)).toBeTruthy();
    const card = within(group).getByRole('radio', { name: /Card/ });
    expect(card.getAttribute('aria-describedby')).toBeTruthy(); // the hint is read out with the option
    fireEvent.click(card);
    expect(onChange).toHaveBeenCalledWith('card');
    expect(await screen.findByText(/Free cancellation up to 48 hours/)).toBeTruthy();
    expect(screen.getByText(/delivery fee is always refunded in full/i)).toBeTruthy();
  });

  it('disables Wallet when the balance is too low and moves the choice to card', async () => {
    getWallet.mockResolvedValue({ balanceMinor: 1000 });
    getPolicy.mockResolvedValue(POLICY);
    const onChange = vi.fn();
    render(<PaymentMethodPicker amountMinor={15000} methods={['wallet', 'card']} value="wallet" onChange={onChange} />);

    await waitFor(() => expect(screen.getByRole('radio', { name: /Wallet/ }).disabled).toBe(true));
    expect(screen.getByText(/Not enough balance/)).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith('card');
  });

  it('surfaces wallet and policy failures and allows the details to be retried', async () => {
    getWallet.mockRejectedValueOnce(new Error('Wallet temporarily unavailable')).mockResolvedValueOnce({ balanceMinor: 50000 });
    getPolicy.mockRejectedValueOnce(new Error('Policy temporarily unavailable')).mockResolvedValueOnce(POLICY);
    const onChange = vi.fn();
    render(<PaymentMethodPicker amountMinor={15000} methods={['wallet', 'card']} value="wallet" onChange={onChange} />);

    await screen.findByText(/Could not load your wallet balance.*Could not load the refund and late-fee policy/);
    expect(screen.getByRole('radio', { name: /Wallet/ }).disabled).toBe(true);
    expect(onChange).toHaveBeenCalledWith('card');
    fireEvent.click(screen.getByRole('button', { name: 'Retry payment details' }));
    expect(await screen.findByText(/Balance .*500/)).toBeTruthy();
    expect(await screen.findByText(/Free cancellation up to 48 hours/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Wallet/ }).disabled).toBe(false);
  });

  it('says so when no payment method is available', () => {
    getWallet.mockResolvedValue({ balanceMinor: 0 });
    getPolicy.mockResolvedValue(POLICY);
    render(<PaymentMethodPicker amountMinor={100} methods={[]} value="" onChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/temporarily unavailable/);
  });
});

describe('Wallet page and history (Req 36, 78)', () => {
  it('shows the balance, what is still owed, and the history with signed amounts', async () => {
    getWallet.mockResolvedValue({ balance: 365.5, balanceMinor: 36550, currency: 'EGP', outstandingLateFeesMinor: 2000 });
    getLedger.mockResolvedValue(page([
      { _id: 't2', type: 'late_fee', amountMinor: -6000, balanceAfterMinor: 36550, createdAt: '2026-11-10T10:00:00Z', note: 'Late fee: 3 days late' },
      { _id: 't1', type: 'refund', amountMinor: 12550, balanceAfterMinor: 42550, createdAt: '2026-11-09T10:00:00Z' },
    ]));
    inRouter(<WalletPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'My wallet' })).toBeTruthy();
    const balance = await screen.findByText('Available balance');
    expect(balance.nextElementSibling.textContent).toMatch(/365\.50/);
    expect(screen.getByText(/still owe .*20/)).toBeTruthy();
    const history = await screen.findByRole('list', { name: 'Wallet history' });
    const rows = within(history).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Late fee.*−.*60/);
    expect(rows[1].textContent).toMatch(/Refund.*\+.*125\.50/);
  });

  it('filters the history by type and starts again at page 1', async () => {
    getLedger.mockResolvedValue(page([]));
    render(<WalletLedger />);
    expect(await screen.findByText('No wallet activity yet.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'refund' } });
    await waitFor(() => expect(getLedger).toHaveBeenLastCalledWith({ page: 1, limit: 10, type: 'refund' }));
  });

  it('shows the server error instead of an empty list', async () => {
    getLedger.mockRejectedValue(Object.assign(new Error('Network down'), { response: { data: { message: 'Could not load your wallet' } } }));
    render(<WalletLedger />);
    expect(await screen.findByText(/Could not load your wallet|Network down/)).toBeTruthy();
  });
});

describe('Late fees page (Req 78)', () => {
  it('lists each fee with days late, paid and still owed', async () => {
    getLateFees.mockResolvedValue(page([
      { _id: 'f1', itemTitle: 'Cordless drill', dueAt: '2026-11-05T00:00:00Z', returnedAt: '2026-11-08T00:00:00Z', daysLate: 3, lateFeeMinor: 6000, chargedMinor: 4000, outstandingMinor: 2000, chargedAt: '2026-11-08T00:00:00Z' },
    ], { outstandingTotalMinor: 2000 }));
    inRouter(<LateFeesPage />);

    const list = await screen.findByRole('list', { name: 'Late fees' });
    const row = within(list).getByRole('listitem');
    expect(row.textContent).toMatch(/Cordless drill/);
    expect(row.textContent).toMatch(/3 days late/);
    expect(row.textContent).toMatch(/Partly paid/);
    expect(screen.getByText(/You still owe/)).toBeTruthy();
  });

  it('is registered as a member-only route at /account/late-fees', () => {
    expect(member2Routes).toEqual([expect.objectContaining({ path: '/account/late-fees', access: 'member' })]);
  });
});
