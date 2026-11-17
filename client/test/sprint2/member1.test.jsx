import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckoutPage from '../../src/pages/checkout/CheckoutPage';
import { getCheckoutQuote, submitCheckout } from '../../src/api/checkout.api';
import { memberLinks, adminLinks } from '../../src/components/layout/navLinks';
import routes from '../../src/routes/routeConfig';

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'borrower-1' } }),
}));

vi.mock('../../src/api/checkout.api', () => ({
  getCheckoutQuote: vi.fn(),
  submitCheckout: vi.fn(),
}));

vi.mock('../../src/api/axios', () => ({
  default: {
    get: vi.fn(async (path) => {
      if (path !== '/payments/policy') throw new Error('Unexpected test request: ' + path);
      return { data: { policy: {
        cancellation: { freeCancellationHours: 48, partialRefundPercent: 50 },
        lateFee: { percentOfDepositPerDay: 5, capPercentOfDeposit: 50 },
      } } };
    }),
  },
  getErrorMessage: (error) => error.message,
}));

vi.mock('../../src/api/account.api', () => ({
  getWallet: vi.fn(async () => ({ balanceMinor: 100000 })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('shared Sprint 2 UI', () => {
  it('offers wallet payment in checkout and submits the chosen method with the quote', async () => {
    getCheckoutQuote.mockResolvedValue({
      amountMinor: 12000, currency: 'EGP', paymentMethods: ['wallet'],
      quoteHash: 'example-quote', lines: [],
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

  it('adds feature navigation only when the matching route is registered', () => {
    for (const [menu, path, label] of [
      [memberLinks, '/account/late-fees', 'Late fees'],
      [memberLinks, '/membership', 'Membership'],
      [adminLinks, '/admin/membership-report', 'Membership report'],
    ]) {
      const link = menu.find((entry) => entry.to === path);
      expect(link).toEqual(routes.some((route) => route.path === path) ? { to: path, label } : undefined);
    }
  });
});
