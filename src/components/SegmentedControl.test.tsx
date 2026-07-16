import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from './SegmentedControl.js';

const data = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
];

describe('SegmentedControl', () => {
  it('renders all segments as tabs with the selected one aria-selected', () => {
    render(<SegmentedControl data={data} value="a" onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('fires onChange with the clicked segment value', () => {
    const onChange = vi.fn();
    render(<SegmentedControl data={data} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not fire onChange for a disabled segment', () => {
    const onChange = vi.fn();
    render(<SegmentedControl data={data} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ArrowRight moves selection to the next enabled segment (skipping disabled + wrapping)', () => {
    const onChange = vi.fn();
    render(<SegmentedControl data={data} value="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    // from Beta, ArrowRight skips the disabled Gamma and wraps to Alpha
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('ArrowLeft moves selection to the previous enabled segment', () => {
    const onChange = vi.fn();
    render(<SegmentedControl data={data} value="b" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('disables the whole control', () => {
    const onChange = vi.fn();
    render(<SegmentedControl data={data} value="a" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
