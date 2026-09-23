import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/index.js';

interface TestEvents {
  Ping: { n: number };
  Pong: { text: string };
}

describe('createEventBus', () => {
  it('delivers typed payloads only to subscribers of that event', () => {
    const bus = createEventBus<TestEvents>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.subscribe('Ping', ping);
    bus.subscribe('Pong', pong);
    bus.publish('Ping', { n: 1 });
    expect(ping).toHaveBeenCalledWith({ n: 1 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.subscribe('Ping', handler);
    off();
    bus.publish('Ping', { n: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates throwing handlers', () => {
    const onError = vi.fn();
    const bus = createEventBus<TestEvents>(onError);
    const good = vi.fn();
    bus.subscribe('Ping', () => {
      throw new Error('boom');
    });
    bus.subscribe('Ping', good);
    bus.publish('Ping', { n: 3 });
    expect(good).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Ping', expect.any(Error));
  });
});
