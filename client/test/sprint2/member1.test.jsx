import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import { register } from '../../src/api/auth.api';
import Navbar from '../../src/components/layout/Navbar';
import RegisterPage from '../../src/pages/auth/RegisterPage';
import CheckoutPage from '../../src/pages/checkout/CheckoutPage';
import { getCheckoutQuote, getCheckoutStatus, submitCheckout } from '../../src/api/checkout.api';
import { memberLinks, adminLinks } from '../../src/components/layout/navLinks';
import routes from '../../src/routes/routeConfig';

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../src/api/auth.api', () => ({ register: vi.fn() }));

vi.mock('../../src/api/checkout.api', () => ({
  getCheckoutQuote: vi.fn(),
  getCheckoutStatus: vi.fn(),
  submitCheckout: vi.fn(),
}));

vi.mock('../../src/api/axios', () => ({
  default: {
    get: vi.fn(async (path) => {
      if (path === '/delivery/items/item-1') return { data: { item: { id: 'item-1', offered: false, fee: 0 } } };
      if (path === '/notifications/unread-count') return { data: { count: 2 } };
      if (path === '/notifications') return { data: { items: [] } };
      if (path !== '/payments/policy') throw new Error('Unexpected test request: ' + path);
      return { data: { policy: {
        cancellation: { freeCancellationHours: 48, partialRefundPercent: 50 },
        lateFee: { percentOfDepositPerDay: 5, capPercentOfDeposit: 50 },
      } } };
    }),
  },
  getErrorMessage: (error) => error.message,
  getFieldErrors: () => [],
}));

vi.mock('../../src/api/account.api', () => ({
  getWallet: vi.fn(async () => ({ balanceMinor: 100000 })),
}));

beforeEach(() => {
  useAuth.mockReturnValue({ user: { _id: 'borrower-1', role: 'member', username: 'fixture' }, setUser: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('shared Sprint 2 UI', () => {
  it('offers wallet payment in checkout and submits the chosen method with the quote', async () => {
    getCheckoutQuote.mockResolvedValue({
      amountMinor: 12000, currency: 'EGP', paymentMethods: ['wallet'],
      quoteHash: 'example-quote', lines: [{
        entryId: 'entry-1', itemId: 'item-1', title: 'Tool', startDate: '2030-01-01', endDate: '2030-01-02',
        deposit: { amount: 120 }, fulfilment: { method: 'pickup', deliveryFee: 0 },
      }],
    });
    submitCheckout.mockResolvedValue({ id: 'checkout-1', status: 'completed' });
    render(<MemoryRouter initialEntries={['/checkout']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CheckoutPage />
    </MemoryRouter>);

    const wallet = await screen.findByRole('radio', { name: /wallet/i });
    expect(wallet.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Submit reservation requests' }));

    expect(submitCheckout).toHaveBeenCalledWith(expect.objectContaining({
      source: 'borrowList', method: 'wallet', quoteHash: 'example-quote',
      operationKey: expect.any(String),
    }));
  });

  it('uses a fresh operation key after an expired card checkout returns to ShareShed', async () => {
    getCheckoutQuote.mockResolvedValue({
      amountMinor: 12000, currency: 'EGP', paymentMethods: ['card'], quoteHash: 'same-quote-after-expiry',
      lines: [{
        entryId: 'entry-1', itemId: 'item-1', title: 'Tool', startDate: '2030-01-01', endDate: '2030-01-02',
        deposit: { amount: 120 }, fulfilment: { method: 'pickup', deliveryFee: 0 },
      }],
    });
    submitCheckout.mockResolvedValue({ id: 'card-attempt-1', status: 'awaiting_payment' });
    getCheckoutStatus.mockResolvedValue({ id: 'card-attempt-1', status: 'failed', failure: 'The payment failed or expired' });
    render(
      <MemoryRouter initialEntries={['/checkout']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Link to="/checkout">Return to checkout</Link>
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/status/:checkoutId" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Submit reservation requests' }));
    await screen.findByText('The payment failed or expired');
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('link', { name: 'Return to checkout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit reservation requests' }));
    expect(submitCheckout).toHaveBeenCalledTimes(2);
    expect(submitCheckout.mock.calls[0][0].operationKey).not.toBe(submitCheckout.mock.calls[1][0].operationKey);
  });

  it('adds feature navigation only when the matching route is registered', () => {
    for (const [menu, path, label] of [
      [memberLinks, '/account/late-fees', 'Late fees'],
      [memberLinks, '/membership', 'Membership'],
      [memberLinks, '/referrals', 'Referrals'],
      [memberLinks, '/account/notification-preferences', 'Email preferences'],
      [adminLinks, '/admin/referrals', 'Referral report'],
      [adminLinks, '/admin/membership-report', 'Membership report'],
      [adminLinks, '/admin/promo-codes', 'Promo codes'],
      [adminLinks, '/admin/promo-usage', 'Promo usage'],
    ]) {
      const link = menu.find((entry) => entry.to === path);
      expect(link).toEqual(routes.some((route) => route.path === path) ? { to: path, label } : undefined);
    }
  });
});


describe('Member 9 integration', () => {
  it('passes the query code through the signup request', async () => {
    register.mockResolvedValue({ user: { _id: 'new-member' } });
    render(
      <MemoryRouter initialEntries={['/register?ref=%20aBc123%20']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<p>Signed in</p>} />
        </Routes>
      </MemoryRouter>,
    );
    for (const [label, value] of [
      ['Username', 'signup_ref'], ['Password', 'ShareShed9!'], ['Full name', 'Referral Guest'],
      ['Email', 'new@example.test'], ['Phone number', '01212345678'], ['Street address', 'Test St'], ['City', 'Cairo'],
    ]) fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Signed in')).toBeTruthy();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ ref: 'aBc123', username: 'signup_ref' }));
  });

  it('mounts the notification bell for a member when the feature is present', async () => {
    const view = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Navbar /></MemoryRouter>);
    if (routes.some(({ path }) => path === '/notifications')) {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Notifications, 2 unread' }));
      expect(screen.getByRole('dialog', { name: 'Recent notifications' })).toBeTruthy();
    } else {
      expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    }
    useAuth.mockReturnValue({ user: { _id: 'admin-1', role: 'admin', username: 'admin' }, isAdmin: true });
    view.rerender(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Navbar /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    useAuth.mockReturnValue({ user: null });
    view.rerender(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Navbar /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
  });
});
