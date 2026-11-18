import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AvailabilityCalendar from '../../src/components/sprint2/m7/AvailabilityCalendar';
import AvailabilityFilter from '../../src/components/sprint2/m7/AvailabilityFilter';
import LeaveWaitlistButton from '../../src/components/sprint2/m7/LeaveWaitlistButton';
import { addDays, isDay, offerUrl, reserveUrl } from '../../src/components/sprint2/m7/dateUtils';
import routes from '../../src/routes/routeConfig';
import { memberLinks } from '../../src/components/layout/navLinks';
import { getAvailability } from '../../src/api/catalog.api';

vi.mock('../../src/api/catalog.api', () => ({ getAvailability: vi.fn() }));
vi.mock('../../src/api/axios', () => ({ default: {}, getErrorMessage: (e) => e.message }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-06-10T12:00:00.000Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('Member 7 date helpers and links', () => {
  it('validates real UTC days and shifts them', () => {
    expect(isDay('2030-02-30')).toBe(false);
    expect(isDay('2030-99-40')).toBe(false);
    expect(addDays('2030-06-30', 1)).toBe('2030-07-01');
  });

  it('builds the single-checkout links M1 expects, including the waitlist hold', () => {
    expect(reserveUrl('item-1', '2030-06-13', '2030-06-16'))
      .toBe('/checkout?source=single&itemId=item-1&startDate=2030-06-13&endDate=2030-06-16');
    const url = new URL(offerUrl('item-1', { holdId: 'h1', startDate: '2030-06-13T00:00:00.000Z', endDate: '2030-06-16T00:00:00.000Z' }), 'http://x');
    expect(url.pathname).toBe('/checkout');
    expect(Object.fromEntries(url.searchParams)).toEqual({ source: 'single', itemId: 'item-1', startDate: '2030-06-13', endDate: '2030-06-16', holdId: 'h1' });
  });

  it('registers the waitlist route through the sprint2 route module', () => {
    expect(routes.some((r) => r.path === '/waitlists' && r.access === 'member')).toBe(true);
    expect(memberLinks).toContainEqual({ to: '/waitlists', label: 'My waitlists' });
  });
});

describe('AvailabilityCalendar', () => {
  const booked = [{ start: '2030-06-14', end: '2030-06-15', type: 'booked' }];

  it('labels booked days in text and reports an unavailable selection', async () => {
    getAvailability.mockResolvedValue({ booked });
    const onAvailabilityChange = vi.fn();
    const { container } = render(
      <AvailabilityCalendar itemId="item-1" value={{ start: '2030-06-13', end: '2030-06-16' }} onChange={vi.fn()} onAvailabilityChange={onAvailabilityChange} />,
    );
    await waitFor(() => expect(container.querySelector('[data-day="2030-06-14"]').getAttribute('aria-label')).toMatch(/booked/));
    expect(container.querySelector('[data-day="2030-06-12"]').getAttribute('aria-label')).toMatch(/available/);
    expect(container.querySelector('[data-day="2030-06-05"]').getAttribute('aria-label')).toMatch(/in the past/);
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenLastCalledWith(false));
  });

  it('treats the return day as free: a booking starting on the return day does not block', async () => {
    getAvailability.mockResolvedValue({ booked: [{ start: '2030-06-16', end: '2030-06-18', type: 'booked' }] });
    const onAvailabilityChange = vi.fn();
    render(<AvailabilityCalendar itemId="item-1" value={{ start: '2030-06-13', end: '2030-06-16' }} onChange={vi.fn()} onAvailabilityChange={onAvailabilityChange} />);
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenLastCalledWith(true));
  });

  it('selects pickup then return day, ignoring past days', async () => {
    getAvailability.mockResolvedValue({ booked: [] });
    const onChange = vi.fn();
    const { container, rerender } = render(<AvailabilityCalendar itemId="item-1" value={{ start: '', end: '' }} onChange={onChange} />);
    await waitFor(() => expect(getAvailability).toHaveBeenCalled());
    fireEvent.click(container.querySelector('[data-day="2030-06-05"]'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-day="2030-06-13"]'));
    expect(onChange).toHaveBeenLastCalledWith({ start: '2030-06-13', end: '' });
    rerender(<AvailabilityCalendar itemId="item-1" value={{ start: '2030-06-13', end: '' }} onChange={onChange} />);
    fireEvent.click(container.querySelector('[data-day="2030-06-16"]'));
    expect(onChange).toHaveBeenLastCalledWith({ start: '2030-06-13', end: '2030-06-16' });
  });

  it('moves focus with the arrow keys', async () => {
    getAvailability.mockResolvedValue({ booked: [] });
    const { container } = render(<AvailabilityCalendar itemId="item-1" value={{ start: '2030-06-13', end: '' }} onChange={vi.fn()} />);
    const day = container.querySelector('[data-day="2030-06-13"]');
    day.focus();
    fireEvent.keyDown(day, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement.getAttribute('data-day')).toBe('2030-06-14'));
  });

  it('keeps an unavailable calendar response from being announced as free dates', async () => {
    getAvailability.mockRejectedValue(new Error('Could not load availability'));
    const { container } = render(<AvailabilityCalendar itemId="item-1" onChange={vi.fn()} />);
    expect(await screen.findByText('Could not load availability')).toBeTruthy();
    const day = container.querySelector('[data-day="2030-06-10"]');
    expect(day.getAttribute('aria-label')).toMatch(/availability unknown/);
    expect(day.tabIndex).toBe(0);
  });
});

describe('AvailabilityFilter', () => {
  it('rejects a return day on or before the pickup day and applies a valid range', () => {
    const onChange = vi.fn();
    render(<AvailabilityFilter onChange={onChange} />);
    const [from, to] = screen.getAllByDisplayValue('');
    fireEvent.change(from, { target: { value: '2030-06-20' } });
    fireEvent.change(to, { target: { value: '2030-06-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check availability' }));
    expect(screen.getByText('The return day must be after the pickup day.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(to, { target: { value: '2030-06-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check availability' }));
    expect(onChange).toHaveBeenCalledWith({ from: '2030-06-20', to: '2030-06-22' });
  });
});

it('asks before leaving the waitlist, with keyboard cancellation and confirmation', () => {
  const leave = vi.fn();
  render(<LeaveWaitlistButton onLeave={leave} />);
  const trigger = screen.getByRole('button', { name: 'Leave waitlist' });
  fireEvent.click(trigger);
  const confirm = screen.getByRole('button', { name: 'Confirm leaving' });
  expect(document.activeElement).toBe(confirm);
  fireEvent.keyDown(confirm, { key: 'Escape' });
  expect(document.activeElement).toBe(trigger);
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm leaving' }));
  expect(leave).toHaveBeenCalledTimes(1);
});
