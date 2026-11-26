import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { lenderLinks, memberLinks } from '../../src/components/layout/navLinks';
import FeedbackProvider from '../../src/components/feedback/FeedbackProvider';
import BorrowListEntry from '../../src/components/sprint2/m5/BorrowListEntry';
import ReservationDetailsPage from '../../src/pages/lifecycle/ReservationDetailsPage';
import { getReservation } from '../../src/api/reservationLifecycle.api';
import { getDeliveryStatus, setDeliveryStatus } from '../../src/api/delivery.api';
import BorrowListButton from '../../src/components/sprint2/m5/BorrowListButton';
import { getMyBorrowList } from '../../src/api/borrowLists.api';

vi.mock('../../src/api/reservationLifecycle.api', () => ({ getReservation: vi.fn() }));
vi.mock('../../src/api/delivery.api', () => ({ getDeliveryStatus: vi.fn(), setDeliveryStatus: vi.fn() }));
vi.mock('../../src/api/borrowLists.api', () => ({ getMyBorrowList: vi.fn(), addBorrowListEntry: vi.fn() }));
vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'member-5' }, loading: false, isMember: true }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('includes the borrow list and lending dashboard in their role-based menus', () => {
  expect(memberLinks).toContainEqual({ to: '/borrow-list', label: 'Borrow list' });
  expect(lenderLinks).toContainEqual({ to: '/lender/dashboard', label: 'Lending dashboard' });
});

it('shows old cart lines with missing dates and lets the member edit them', () => {
  const entry = {
    item: { _id: 'item-5', title: 'Fixture drill', depositAmount: 0 }, startDate: '2030-01-01', endDate: null,
    days: null, problem: 'invalid_dates', problemMessage: 'Choose valid start and end dates.',
  };
  const onEdit = vi.fn();
  const view = (editing) => (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BorrowListEntry entry={entry} editing={editing} onEdit={onEdit} />
    </MemoryRouter>
  );
  const { rerender } = render(view(false));
  expect(screen.getByText('Dates needed')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Change dates for Fixture drill' }));
  expect(onEdit).toHaveBeenCalledWith(entry);
  rerender(view(true));
  expect(screen.getByRole('button', { name: 'Save dates' })).toBeTruthy();
  expect(screen.getByLabelText(/End date/).value).toBe('');
});

it('shows delivery controls and refreshes the reservation for the return after handover', async () => {
  const reservation = {
    _id: 'loan-5', role: 'lender', status: 'confirmed', item: { title: 'Delivery drill' },
    borrower: { name: 'Fixture borrower' }, startDate: '2030-01-01', endDate: '2030-01-03', days: 2,
    fulfilment: { method: 'delivery', deliveryStatus: 'out_for_delivery' }, flags: {}, actions: {},
  };
  getReservation.mockResolvedValueOnce({ reservation }).mockResolvedValue({
    reservation: { ...reservation, status: 'active', actions: { returnGood: true } },
  });
  const delivery = { method: 'delivery', deliveryStatus: 'out_for_delivery', canUpdate: true };
  getDeliveryStatus.mockResolvedValue(delivery);
  setDeliveryStatus.mockResolvedValue({ ...delivery, deliveryStatus: 'delivered', canUpdate: false });
  render(
    <MemoryRouter initialEntries={['/reservations/loan-5']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FeedbackProvider><Routes><Route path="/reservations/:id" element={<ReservationDetailsPage />} /></Routes></FeedbackProvider>
    </MemoryRouter>,
  );
  const delivered = await screen.findByRole('button', { name: 'Mark delivered' });
  expect(screen.queryByRole('button', { name: /picked up|handed over/i })).toBeNull();
  fireEvent.click(delivered);
  expect(await screen.findByRole('button', { name: /returned in good condition/i })).toBeTruthy();
  expect(setDeliveryStatus).toHaveBeenCalledWith('loan-5', 'delivered');
});

it('fills the borrow form with the dates the item page passes and follows changes', async () => {
  getMyBorrowList.mockResolvedValue({ borrowList: { count: 0, max: 10, entries: [] } });
  const view = (startDate, endDate) => (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FeedbackProvider><BorrowListButton itemId="item-7" ownerId="lender-1" maxBorrowDays={3} startDate={startDate} endDate={endDate} /></FeedbackProvider>
    </MemoryRouter>
  );
  const { rerender } = render(view('2030-01-01', '2030-01-03'));
  await screen.findByRole('button', { name: 'Add to borrow list' });
  expect(screen.getByLabelText(/Start date/).value).toBe('2030-01-01');
  expect(screen.getByLabelText(/End date/).value).toBe('2030-01-03');
  rerender(view('2030-02-10', '2030-02-11'));
  expect(screen.getByLabelText(/Start date/).value).toBe('2030-02-10');
  expect(screen.getByLabelText(/End date/).value).toBe('2030-02-11');
  rerender(view(undefined, undefined));
  expect(screen.getByLabelText(/Start date/).value).toBe('');
});
