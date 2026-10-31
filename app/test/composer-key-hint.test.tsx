// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import Composer from '../src/components/Composer';
import { useStore } from '../src/store';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
afterEach(cleanup);

const ADMIN_HINT = 'Add an API key to send tasks. Paste it into this box to save it.';

describe('no-key hint under the composer', () => {
  it('an admin with no key sees how to add one', () => {
    useStore.setState({ role: 'admin', keys: {}, busy: false });
    render(<Composer />);
    expect(screen.getByText(ADMIN_HINT)).toBeTruthy();
  });
  it('a non-admin with no key sees no hint line', () => {
    useStore.setState({ role: null, keys: {}, busy: false });
    const { container } = render(<Composer />);
    expect(screen.queryByText(ADMIN_HINT)).toBeNull();
    expect(container.querySelector('.composer-key-hint')).toBeNull();
  });
  it('with a key set there is no hint', () => {
    useStore.setState({ role: 'admin', keys: { anthropic: 'sk-ant-abcdefghijklmnopqrstuvwxyz0123' }, busy: false });
    const { container } = render(<Composer />);
    expect(container.querySelector('.composer-key-hint')).toBeNull();
    expect(screen.queryByText(ADMIN_HINT)).toBeNull();
  });
  it('the hint disappears once an admin pastes and saves a key', async () => {
    useStore.setState({ role: 'admin', keys: {}, busy: false });
    render(<Composer />);
    expect(screen.getByText(ADMIN_HINT)).toBeTruthy();
    await userEvent
      .setup()
      .type(screen.getByLabelText('Task for the team'), 'sk-ant-abcdefghijklmnopqrstuvwxyz0123{Enter}');
    expect(screen.queryByText(ADMIN_HINT)).toBeNull();
  });
});
