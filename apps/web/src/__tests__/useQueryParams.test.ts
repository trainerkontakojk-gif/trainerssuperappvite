import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQueryParams } from '../hooks/useQueryParams';

describe('useQueryParams', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search: '' },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('returns empty object when no params', () => {
    window.location.search = '';
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({});
  });

  it('parses single param', () => {
    window.location.search = '?batch=Batch+1';
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({ batch: 'Batch 1' });
  });

  it('parses multiple params', () => {
    window.location.search = '?year=2025&month=3&service=call';
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({ year: '2025', month: '3', service: 'call' });
  });

  it('handles encoded values', () => {
    window.location.search = '?name=Budi%20Santoso';
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({ name: 'Budi Santoso' });
  });
});
