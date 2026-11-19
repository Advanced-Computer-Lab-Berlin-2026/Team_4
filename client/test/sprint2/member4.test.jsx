import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FeedbackProvider from '../../src/components/feedback/FeedbackProvider';
import AppRoutes from '../../src/routes/AppRoutes';
import ReportFilters from '../../src/components/sprint2/m4/ReportFilters';
import SupportThread from '../../src/components/sprint2/m4/SupportThread';

const auth = vi.hoisted(() => ({
  user: { _id: 'admin', role: 'admin' }, loading: false, isAdmin: true, isMember: false,
}));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../src/components/layout/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: Outlet };
});
vi.mock('../../src/api/analytics.api', () => ({
  getUsageReport: vi.fn(async () => ({ summary: {}, items: [], categories: [] })),
  downloadUsageReportExport: vi.fn(),
  getDamageReport: vi.fn(async () => ({
    summary: {}, items: [{ caseId: '1', itemTitle: 'Fixture item', status: 'resolved', resolution: 'Partial forfeiture' }],
  })),
  downloadDamageReportExport: vi.fn(),
}));
vi.mock('../../src/api/moderation.api', () => ({
  listModerationReports: vi.fn(async () => ({ items: [], totalPages: 1 })),
  reviewModerationReport: vi.fn(),
  createModerationReport: vi.fn(),
}));
vi.mock('../../src/api/supportTickets.api', () => ({
  getMySupportTickets: vi.fn(async () => ({ items: [] })),
  submitSupportTicket: vi.fn(),
  getAllSupportTickets: vi.fn(async () => ({ items: [] })),
  getSupportTicketById: vi.fn(async () => ({
    entity: { _id: 'abc', ticketNumber: 'abc', subject: 'Example ticket', status: 'open', messages: [] },
  })),
  replyToSupportTicket: vi.fn(),
  resolveSupportTicket: vi.fn(),
}));

afterEach(cleanup);

function page(path, role) {
  Object.assign(auth, { isAdmin: role === 'admin', isMember: role === 'member', user: { role } });
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <FeedbackProvider><AppRoutes /></FeedbackProvider>
  </MemoryRouter>);
}

it.each([
  ['/support', 'member', /Support Center/],
  ['/support/abc', 'member', /Example ticket/],
  ['/admin/moderation', 'admin', /Log Reported Listing or User/],
  ['/admin/reports/usage', 'admin', /Monthly Platform Usage Report/],
  ['/admin/reports/damage', 'admin', /Damage & Dispute Resolution Report/],
  ['/admin/support', 'admin', /Admin Support Desk/],
])('renders %s with access for %s', async (path, role, heading) => {
  page(path, role);
  expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
  if (path.includes('/damage')) expect(await screen.findByText('Partial forfeiture', { selector: 'td' })).toBeTruthy();
});

it('refuses the moderation page for members', async () => {
  page('/admin/moderation', 'member');
  expect(await screen.findByText(/do not have permission/)).toBeTruthy();
});

it('triggers both report export actions and allows replies to an open support ticket', () => {
  const onExportCsv = vi.fn();
  const onExportPdf = vi.fn();
  const onSend = vi.fn(async () => {});
  render(<>
    <ReportFilters filters={{ month: '2026-11' }} onChange={vi.fn()} onReset={vi.fn()}
      onExportCsv={onExportCsv} onExportPdf={onExportPdf} />
    <SupportThread ticket={{ status: 'open', messages: [{ senderRole: 'member', body: 'Need help' }] }}
      onSendReply={onSend} />
  </>);
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
  fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
  fireEvent.change(screen.getByLabelText('Add Reply'), { target: { value: 'Checking' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Reply' }));
  expect(onExportCsv).toHaveBeenCalledOnce();
  expect(onExportPdf).toHaveBeenCalledOnce();
  expect(onSend).toHaveBeenCalledWith('Checking');
});
