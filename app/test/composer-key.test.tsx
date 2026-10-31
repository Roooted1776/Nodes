// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import Composer from '../src/components/Composer';
import { NOT_ADMIN } from '../src/lib/run-task';
import { useStore } from '../src/store';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
afterEach(cleanup);

const KEY = 'sk-ant-abcdefghijklmnopqrstuvwxyz0123';

describe('pasting a key into the composer', () => {
  it('a non-admin is refused: no "saved" message and the key is not stored', async () => {
    useStore.setState({ role: null, keys: {}, status: '', busy: false });
    render(<Composer />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Task for the team'), `${KEY}{Enter}`);
    expect(useStore.getState().keys.anthropic).toBeUndefined();
    expect(useStore.getState().status).toBe(NOT_ADMIN);
    expect(useStore.getState().status).not.toMatch(/saved on this device/);
  });
  it('an admin sees the key saved on this device', async () => {
    useStore.setState({ role: 'admin', keys: {}, status: '', busy: false });
    render(<Composer />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Task for the team'), `${KEY}{Enter}`);
    expect(useStore.getState().keys.anthropic).toBe(KEY);
    expect(useStore.getState().status).toMatch(/key saved on this device\./);
  });
});
