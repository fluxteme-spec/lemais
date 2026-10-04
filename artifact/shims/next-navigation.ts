import { useMemo } from "react";
import { useNav } from "../router";

export function useRouter() {
  const { go } = useNav();
  return useMemo(() => ({ push: (to: string) => go(to), replace: (to: string) => go(to, true), refresh: () => {}, back: () => history.back() }), [go]);
}
export function useParams<T = Record<string, string>>(): T {
  const { params } = useNav();
  return params as T;
}
export function usePathname(): string {
  return useNav().path;
}
export function notFound(): never {
  throw new Error("not found");
}
