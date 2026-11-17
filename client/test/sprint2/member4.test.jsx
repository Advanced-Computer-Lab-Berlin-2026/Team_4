// Member 4 Sprint 2 Frontend Tests - Owner: Member 4
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportFilters from '../../src/components/sprint2/m4/ReportFilters';
import SupportThread from '../../src/components/sprint2/m4/SupportThread';

describe('Member 4 — Sprint 2 UI Components', () => {
    test('ReportFilters triggers CSV and PDF export callbacks', () => {
        const onExportCsv = jest.fn();
        const onExportPdf = jest.fn();

        render(
            <ReportFilters
                mode="usage"
                filters={{ month: '2026-11' }}
                onChange={jest.fn()}
                onReset={jest.fn()}
                onExportCsv={onExportCsv}
                onExportPdf={onExportPdf}
            />
        );

        fireEvent.click(screen.getByText('Export CSV'));
        expect(onExportCsv).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('Export PDF'));
        expect(onExportPdf).toHaveBeenCalledTimes(1);
    });

    test('SupportThread renders conversation history and submits reply', async () => {
        const onSendReply = jest.fn().mockResolvedValue({});
        const ticket = {
            status: 'open',
            messages: [
                {
                    _id: 'm1',
                    senderRole: 'member',
                    sender: { name: 'Jana' },
                    body: 'Need help with deposit',
                },
            ],
        };

        render(<SupportThread ticket={ticket} onSendReply={onSendReply} />);
        expect(screen.getByText('Need help with deposit')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Add Reply'), {
            target: { value: 'Checking now' },
        });
        fireEvent.click(screen.getByText('Send Reply'));
        expect(onSendReply).toHaveBeenCalledWith('Checking now');
    });
});

