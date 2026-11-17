import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../src/context/AuthContext';
import { getWallet } from '../../src/api/account.api';
import { getPolicy } from '../../src/api/payments.api';
import { cancelSubscription, getMyMembership, listTiers, subscribe } from '../../src/api/memberships.api';
import MembershipPlansPage from '../../src/pages/membership/MembershipPlansPage';
import member8Routes from '../../src/routes/sprint2/member8.routes';

vi.mock('../../src/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../src/api/account.api', () => ({ getWallet: vi.fn() }));
vi.mock('../../src/api/payments.api', () => ({ getPolicy: vi.fn() }));
vi.mock('../../src/api/memberships.api', () => ({
  cancelSubscription: vi.fn(), getMyMembership: vi.fn(), listTiers: vi.fn(), subscribe: vi.fn(),
}));

const tiers = [
  { id: 'basic', name: 'Basic', annualFee: 0, depositDiscountPercent: 0, waitlistPriority: 3, maxConcurrentReservations: 3 },
  { id: 'plus', name: 'Plus', annualFee: 150, depositDiscountPercent: 10, waitlistPriority: 2, maxConcurrentReservations: 3 },
  { id: 'premium', name: 'Premium', annualFee: 300, depositDiscountPercent: 20, waitlistPriority: 1, maxConcurrentReservations: 5 },
];
const renewsAt = '2030-04-05T00:00:00Z';
const current = (tier, status = 'active') => ({
  membership: { tier, status, renewsAt: status === 'none' ? null : renewsAt, cancelAtPeriodEnd: status === 'cancelled' },
  entitlements: { discountPercent: tier.depositDiscountPercent, discountSource: { type: 'self', tierName: tier.name }, waitlistPriority: tier.waitlistPriority },
  usage: { counted: 0, limit: tier.maxConcurrentReservations },
});
const storageKey = 'shareshed.membership.attempt:member-8';
const cardAttempt = { tierId: 'premium', method: 'card', operationKey: 'safe-card-attempt', awaitingCard: true };

function mount() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MembershipPlansPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { _id: 'member-8' } });
  getWallet.mockResolvedValue({ balanceMinor: 40000 });
  listTiers.mockResolvedValue({ items: tiers, paymentMethods: ['wallet'] });
  getMyMembership.mockResolvedValue(current(tiers[0], 'none'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('membership payment and cancellation', () => {
  it('displays all tiers and uses only the payment methods the API offers', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribe to Plus' }));
    expect(screen.getByRole('heading', { name: 'Basic' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Wallet/ }).checked).toBe(true);
    expect(screen.queryByRole('radio', { name: /Card/ })).toBeNull();
    await waitFor(() => expect(getWallet).toHaveBeenCalledTimes(1));
    expect(getPolicy).not.toHaveBeenCalled();
  });

  it('subscribes with the wallet and keeps the paid date after cancellation', async () => {
    subscribe.mockResolvedValue(current(tiers[1]));
    cancelSubscription.mockResolvedValue(current(tiers[1], 'cancelled'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribe to Plus' }));
    fireEvent.click(screen.getByRole('button', { name: /^Pay / }));
    expect(await screen.findByRole('heading', { name: 'Your tier: Plus' })).toBeTruthy();
    expect(subscribe).toHaveBeenCalledWith({ tierId: 'plus', method: 'wallet', operationKey: expect.any(String) });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel subscription' }));
    const summary = screen.getByRole('region', { name: 'Your tier: Plus' });
    expect(await within(summary).findByText('Benefits end on')).toBeTruthy();
    expect(cancelSubscription).toHaveBeenCalledTimes(1);
  });

  it('checks the saved card after returning and preserves the key across an outage', async () => {
    listTiers.mockResolvedValue({ items: tiers, paymentMethods: ['wallet', 'card'] });
    sessionStorage.setItem(storageKey, JSON.stringify(cardAttempt));
    subscribe.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(current(tiers[2]));
    mount();
    expect(await screen.findByText('Connection lost')).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem(storageKey))).toEqual(cardAttempt);
    fireEvent.click(screen.getByRole('button', { name: 'Check payment again' }));
    expect(await screen.findByRole('heading', { name: 'Your tier: Premium' })).toBeTruthy();
    expect(subscribe.mock.calls.map(([attempt]) => attempt.operationKey)).toEqual([cardAttempt.operationKey, cardAttempt.operationKey]);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('offers a link for an unpaid saved card without automatically redirecting again', async () => {
    listTiers.mockResolvedValue({ items: tiers, paymentMethods: ['wallet', 'card'] });
    sessionStorage.setItem(storageKey, JSON.stringify(cardAttempt));
    subscribe.mockResolvedValue({ payment: { state: 'pending', redirectUrl: 'https://checkout.stripe.test/pending' } });
    mount();
    const link = await screen.findByRole('link', { name: 'Continue to Stripe' });
    expect(link.getAttribute('href')).toBe('https://checkout.stripe.test/pending');
    expect(JSON.parse(sessionStorage.getItem(storageKey))).toEqual(cardAttempt);
  });

  it('keeps saved card attempts scoped to the member who started them', async () => {
    sessionStorage.setItem('shareshed.membership.attempt:other-member', JSON.stringify(cardAttempt));
    mount();
    expect(await screen.findByRole('heading', { name: 'Your tier: Basic' })).toBeTruthy();
    expect(subscribe).not.toHaveBeenCalled();
  });
});

it('opens Membership from the member-only notification route', async () => {
  const route = member8Routes.find(({ path }) => path === '/account/membership');
  expect(route.access).toBe('member');
  const Redirect = route.element;
  render(
    <MemoryRouter initialEntries={[route.path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path={route.path} element={<Redirect />} />
        <Route path="/membership" element={<MembershipPlansPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Your tier: Basic' })).toBeTruthy();
});
