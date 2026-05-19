import { useState, useEffect } from 'react';

export function useQueryParams(): Record<string, string> {
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const obj: Record<string, string> = {};
    sp.forEach((value, key) => { obj[key] = value; });
    setParams(obj);
  }, []);

  return params;
}
