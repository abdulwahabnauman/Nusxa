import { shouldUseProxy } from '../routing';

describe('shouldUseProxy', () => {
  it('never uses the proxy when it is not configured', () => {
    expect(shouldUseProxy(false, false, false)).toBe(false);
    expect(shouldUseProxy(false, false, true)).toBe(false);
    expect(shouldUseProxy(false, true, true)).toBe(false);
  });

  it('uses the proxy by default when configured', () => {
    expect(shouldUseProxy(true, false, false)).toBe(true);
    expect(shouldUseProxy(true, false, true)).toBe(true);
  });

  it('goes direct when the user prefers own keys and has one', () => {
    expect(shouldUseProxy(true, true, true)).toBe(false);
  });

  it('falls back to the proxy when own keys are preferred but missing', () => {
    expect(shouldUseProxy(true, true, false)).toBe(true);
  });
});
