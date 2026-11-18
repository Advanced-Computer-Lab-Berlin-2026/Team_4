import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { getItem } from '../../src/api/catalog.api';
import { getReport, decideReport } from '../../src/api/damageReports.api';
import { getPhotoFile, listPhotos, uploadPhotos } from '../../src/api/conditionPhotos.api';
import { getReservation } from '../../src/api/reservationLifecycle.api';
import { listPendingReviews, listUserReviews } from '../../src/api/reviews.api';
import { getTrustProfile } from '../../src/api/trustProfiles.api';
import { useAuth } from '../../src/context/AuthContext';
import { adminLinks, memberLinks } from '../../src/components/layout/navLinks';
import AdminDamageDecisionPage from '../../src/pages/admin/AdminDamageDecisionPage';
import ItemDetailsPage from '../../src/pages/items/ItemDetailsPage';
import ReservationDetailsPage from '../../src/pages/lifecycle/ReservationDetailsPage';
import TrustProfilePage from '../../src/pages/reviews/TrustProfilePage';

vi.mock('../../src/api/catalog.api', () => ({
  getItem: vi.fn(), getAvailability: vi.fn().mockResolvedValue({ booked: [] }),
}));
vi.mock('../../src/api/damageReports.api', () => ({
  getReport: vi.fn(), decideReport: vi.fn(), listReports: vi.fn(), resolveReport: vi.fn(),
}));
vi.mock('../../src/api/conditionPhotos.api', () => ({
  getPhotoFile: vi.fn(), listPhotos: vi.fn(), removePhoto: vi.fn(), uploadPhotos: vi.fn(),
}));
vi.mock('../../src/api/reservationLifecycle.api', () => ({ getReservation: vi.fn() }));
vi.mock('../../src/api/reviews.api', () => ({
  createReview: vi.fn(), listMyReviews: vi.fn(), listPendingReviews: vi.fn(), listUserReviews: vi.fn(),
}));
vi.mock('../../src/api/trustProfiles.api', () => ({ getTrustProfile: vi.fn() }));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../src/components/favorites/FavoriteButton', () => ({ default: () => null }));

const lender = { _id: 'lender-fixture', name: 'Fixture lender', username: 'lender', memberSince: '2025-01-01' };
const borrower = { _id: 'borrower-fixture', name: 'Fixture borrower' };
const item = { _id: 'drill', title: 'Cordless drill', owner: lender, photos: [], depositAmount: 400 };
const stats = { ratingCount: 2, ratingAverage: 4.5, completedReservations: 5, onTimeRate: 1, upheldDamageReports: 0 };

function mount(url, route, element) {
  return render(
    <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path={route} element={element} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: borrower, loading: false });
  getItem.mockResolvedValue({ item });
  getTrustProfile.mockImplementation(async (userId) => ({
    profile: { user: userId === lender._id ? lender : borrower, trustScore: 78, stats },
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('registers separate case links for members and admins and a reviews link for members', () => {
  expect(memberLinks.map(({ to }) => to)).toEqual(expect.arrayContaining(['/damage-reports', '/reviews/mine']));
  expect(adminLinks.map(({ to }) => to)).toEqual(expect.arrayContaining(['/admin/damage-reports', '/admin/reports/damage']));
});

it('shows the listing owner’s trust score to guests and links members to the profile', async () => {
  useAuth.mockReturnValue({ user: null, loading: false });
  const guest = mount('/catalog/drill', '/catalog/:id', <ItemDetailsPage />);
  expect(await screen.findByText('Trust score 78/100')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'View trust profile' })).toBeNull();
  guest.unmount();
  useAuth.mockReturnValue({ user: borrower, loading: false });
  mount('/catalog/drill', '/catalog/:id', <ItemDetailsPage />);
  const link = await screen.findByRole('link', { name: 'View trust profile' });
  expect(link.getAttribute('href')).toBe('/users/lender-fixture/trust');
  expect(getTrustProfile).toHaveBeenCalledWith(lender._id);
});

it('lets the lender add return evidence after completion and displays it via an authenticated blob', async () => {
  const reservation = {
    _id: 'loan', status: 'completed', role: 'lender', item, borrower, lender,
    startDate: '2030-01-01', endDate: '2030-01-03', days: 2, actions: {}, flags: {},
  };
  const empty = { photos: { pickup: [], return: [] }, canUpload: { pickup: false, return: true }, maxPerStage: 10 };
  const updated = {
    ...empty,
    photos: { pickup: [], return: [{ _id: 'photo', originalName: 'after.png', takenAt: '2030-01-02' }] },
  };
  getReservation.mockResolvedValue({ reservation });
  listPhotos.mockResolvedValueOnce(empty).mockResolvedValue(updated);
  listPendingReviews.mockResolvedValue({ items: [] });
  uploadPhotos.mockResolvedValue({ photos: updated.photos });
  getPhotoFile.mockResolvedValue(new Blob(['photo'], { type: 'image/png' }));
  const createObjectURL = vi.fn(() => 'blob:private-photo');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
  const view = mount('/reservations/loan', '/reservations/:id', <ReservationDetailsPage />);
  const input = await screen.findByLabelText('Add return photos');
  expect(screen.queryByText('Add pickup photos')).toBeNull();
  const file = new File(['photo'], 'after.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  const image = await screen.findByRole('img', { name: /after\.png/ });
  expect(image.getAttribute('src')).toBe('blob:private-photo');
  expect(uploadPhotos).toHaveBeenCalledWith('loan', 'return', [file], expect.any(Function));
  expect(getPhotoFile).toHaveBeenCalledWith('loan', 'photo');
  expect(screen.getByRole('link', { name: 'View trust profile' }).getAttribute('href')).toBe('/users/borrower-fixture/trust');
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:private-photo');
});

it('displays a member’s received reviews on their trust profile', async () => {
  listUserReviews.mockResolvedValue({
    items: [{
      _id: 'review', rating: 5, createdAt: '2030-01-02', reviewer: borrower, reviewee: lender,
      direction: 'borrower_to_lender', comment: 'Pickup was easy.',
    }],
    page: 1,
    pages: 1,
  });
  mount('/users/lender-fixture/trust', '/users/:userId/trust', <TrustProfilePage />);
  expect(await screen.findByText('Pickup was easy.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: lender.name })).toBeTruthy();
  expect(listUserReviews).toHaveBeenCalledWith(lender._id, { page: 1 });
});


it('refuses fractional cents and submits an exact damage decision', async () => {
  const report = {
    _id: 'case-1', status: 'open', item, borrower, reportedBy: lender,
    reservation: { _id: 'loan', deposit: { amount: 400, status: 'held' } },
  };
  getReport.mockResolvedValue({ report });
  listPhotos.mockResolvedValue({ photos: { pickup: [], return: [] }, canUpload: {}, locked: true });
  decideReport.mockResolvedValue({ report: { ...report, status: 'decided' } });
  vi.stubGlobal('confirm', vi.fn(() => true));
  mount('/admin/damage-reports/case-1', '/admin/damage-reports/:id', <AdminDamageDecisionPage />);
  const amount = await screen.findByRole('spinbutton', { name: 'Amount to keep (EGP)' });
  const note = screen.getByRole('textbox', { name: 'Note (visible to both members)' });
  const submit = screen.getByRole('button', { name: 'Save decision' });
  fireEvent.change(amount, { target: { value: '100.123' } });
  fireEvent.change(note, { target: { value: 'Damage documented' } });
  fireEvent.click(submit);
  expect(screen.getByText('Use at most two decimal places')).toBeTruthy();
  expect(decideReport).not.toHaveBeenCalled();
  fireEvent.change(amount, { target: { value: '100.12' } });
  fireEvent.click(submit);
  expect(await screen.findByText('Decision saved.')).toBeTruthy();
  expect(decideReport).toHaveBeenCalledWith('case-1', { forfeitAmount: 100.12, note: 'Damage documented' });
});
