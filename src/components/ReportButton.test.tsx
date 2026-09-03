// ReportButton — the confirm handshake, the a11y names, and the honesty of the
// settled copy. A pure-props component (pack Button + Group), so it renders
// standalone with no host.
//
// 🔴 The copy assertions are not cosmetic. `report()` files a row for moderator
// review and explicitly does NOT hide it, so a settled state reading "Removed"
// or "Hidden" would be the app lying about what the platform did. That is the
// one thing about this control that cannot be allowed to drift, which is why it
// is pinned on the rendered STRING rather than on a testid alone.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReportButton } from './ReportButton.js';

describe('ReportButton', () => {
  it('does NOT fire on the trigger — only from the armed confirm', async () => {
    const onReport = vi.fn(async () => {});
    render(<ReportButton noun="combination" onReport={onReport} />);

    await userEvent.click(screen.getByTestId('report-button'));
    // Armed, but nothing sent yet.
    expect(screen.getByTestId('report-confirm-prompt')).toBeInTheDocument();
    expect(onReport).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('report-confirm'));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('cancel disarms without sending', async () => {
    const onReport = vi.fn(async () => {});
    render(<ReportButton noun="prompt" onReport={onReport} />);

    await userEvent.click(screen.getByTestId('report-button'));
    await userEvent.click(screen.getByTestId('report-cancel'));

    expect(screen.getByTestId('report-button')).toBeInTheDocument();
    expect(onReport).not.toHaveBeenCalled();
  });

  it('🔴 the settled state says REPORTED, never removed or hidden', async () => {
    render(<ReportButton noun="combination" onReport={async () => {}} />);

    await userEvent.click(screen.getByTestId('report-button'));
    await userEvent.click(screen.getByTestId('report-confirm'));

    const done = await screen.findByTestId('report-done');
    expect(done).toHaveTextContent('Reported for review');
    // The whole control, normalised — a reword that reintroduces a deletion
    // claim fails here rather than shipping.
    expect(done.textContent).toBe('Reported for review');
    expect(done.textContent).not.toMatch(/remov|delet|hidden|hid/i);
  });

  it('🔴 a REJECTED report stays armed and says so — it must not read as filed', async () => {
    const onReport = vi.fn(async () => {
      throw new Error('REPORT_FAILED');
    });
    render(<ReportButton noun="prompt" onReport={onReport} />);

    await userEvent.click(screen.getByTestId('report-button'));
    await userEvent.click(screen.getByTestId('report-confirm'));

    // Still armed, with a retry affordance, and NOT settled.
    expect(await screen.findByTestId('report-confirm-prompt')).toHaveTextContent(/could not send/i);
    expect(screen.queryByTestId('report-done')).toBeNull();

    // POSITIVE CONTROL on the instrument: the same component DOES settle when
    // the call resolves, so the assertion above is about the rejection and not
    // about the settled state being unreachable.
    await userEvent.click(screen.getByTestId('report-cancel'));
    const ok = vi.fn(async () => {});
    render(<ReportButton noun="prompt" onReport={ok} data-testid="ok-report" />);
    await userEvent.click(screen.getByTestId('ok-report'));
    await userEvent.click(screen.getAllByTestId('report-confirm')[0]!);
    expect(await screen.findByTestId('report-done')).toBeInTheDocument();
  });

  it('carries an accessible name naming the row type', async () => {
    render(<ReportButton noun="combination" onReport={async () => {}} />);
    expect(
      screen.getByRole('button', { name: 'Report this combination to moderators' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('report-button'));
    expect(
      screen.getByRole('button', { name: 'Confirm reporting this combination to moderators' }),
    ).toBeInTheDocument();
  });
});
