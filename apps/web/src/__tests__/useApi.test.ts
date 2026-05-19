import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApi, postApi } from '../hooks/useApi';

function mockLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
    },
    writable: true,
    configurable: true,
  });
}

describe('useApi', () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [{ id: '1', name: 'Test' }] }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns data after fetch', async () => {
    const { result } = renderHook(() => useApi<any[]>('/test'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: '1', name: 'Test' }]);
    expect(result.current.error).toBeNull();
  });

  it('returns null data when path is null', () => {
    const { result } = renderHook(() => useApi<any[]>(null));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('sets error on API failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { message: 'Not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useApi<any[]>('/not-found'));
    await waitFor(() => expect(result.current.error).toBe('Not found'));
    expect(result.current.data).toBeNull();
  });

  it('refetch works', async () => {
    const { result } = renderHook(() => useApi<any[]>('/test'));
    await waitFor(() => expect(result.current.data).toBeTruthy());

    vi.mocked(globalThis.fetch).mockReset();
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [{ id: '2' }] }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toEqual([{ id: '2' }]));
  });
});

describe('postApi', () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'new' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST with JSON body', async () => {
    const data = await postApi('/test', { name: 'foo' });
    expect(data).toEqual({ id: 'new' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'foo' }),
      }),
    );
  });

  it('throws on error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { message: 'Bad request' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(postApi('/test', {})).rejects.toThrow('Bad request');
  });
});
