import { useLocation } from "@tanstack/react-router";

export function useQueryParams(): Record<string, string> {
  const location = useLocation();
  const sp = new URLSearchParams(location.searchStr);
  const obj: Record<string, string> = {};
  sp.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}
