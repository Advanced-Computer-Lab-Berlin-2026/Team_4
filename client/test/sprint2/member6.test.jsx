import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckoutPage from '../../src/pages/checkout/CheckoutPage';
import { getCheckoutQuote, submitCheckout } from '../../src/api/checkout.api';

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'borrower-6', address: { street: '1 Saved Street', city: 'Cairo' } } }),
}));
vi.mock('../../src/api/checkout.api', () => ({ getCheckoutQuote: vi.fn(), submitCheckout: vi.fn() }));
vi.mock('../../src/api/delivery.api', () => ({
  getDeliveryOffer: vi.fn(async (id) => ({ id, offered: id === 'drill', fee: 0 })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

const fixture = (entryId, itemId, title) => ({
  entryId, itemId, title, startDate: '2030-01-01', endDate: '2030-01-02',
  fulfilment: { method: 'pickup', deliveryFee: 0 }, deposit: { amount: 0 },
});

it('requotes delivery and promo changes and submits only the latest reviewed cart', async () => {
  getCheckoutQuote.mockImplementation(async (request) => ({
    quoteHash: JSON.stringify(request), amountMinor: 0, currency: 'EGP',
    paymentMethods: ['wallet'], lines: [fixture('entry-a', 'drill', 'Drill'), fixture('entry-b', 'ladder', 'Ladder')],
  }));
  submitCheckout.mockResolvedValue({ id: 'checkout-6', status: 'completed' });
  render(<MemoryRouter initialEntries={['/checkout']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <CheckoutPage />
  </MemoryRouter>);

  const drill = within(await screen.findByRole('group', { name: /Drill/ }));
  const ladder = within(screen.getByRole('group', { name: /Ladder/ }));
  const submit = screen.getByRole('button', { name: 'Submit reservation requests' });
  expect(ladder.queryByRole('radio', { name: /^Delivery/ })).toBeNull();

  fireEvent.click(await drill.findByRole('radio', { name: /^Delivery/ }));
  expect(submit.disabled).toBe(true);
  await waitFor(() => expect(getCheckoutQuote).toHaveBeenLastCalledWith({
    source: 'borrowList', fulfilmentByEntry: { 'entry-a': { method: 'delivery', deliveryAddress: '1 Saved Street, Cairo' } },
  }));
  fireEvent.click(drill.getByRole('radio', { name: 'Enter another address' }));
  expect(submit.disabled).toBe(true);
  fireEvent.change(drill.getByRole('textbox', { name: 'Delivery address' }), { target: { value: '2 New Street' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Code' }), { target: { value: 'tools' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply code' }));
  const reviewed = {
    source: 'borrowList', fulfilmentByEntry: { 'entry-a': { method: 'delivery', deliveryAddress: '2 New Street' } },
  };
  await waitFor(() => expect(getCheckoutQuote).toHaveBeenLastCalledWith({ ...reviewed, promoCode: 'TOOLS' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove code' }));
  expect(submit.disabled).toBe(true);
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);
  expect(submitCheckout).toHaveBeenCalledWith({
    ...reviewed, method: 'wallet', operationKey: expect.any(String), quoteHash: JSON.stringify(reviewed),
  });
});
