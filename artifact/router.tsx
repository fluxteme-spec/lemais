"use client";
/** Roteador em memória para a página única (substitui next/link e next/navigation). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Nav = { path: string; query: URLSearchParams; params: Record<string, string>; go: (to: string, replace?: boolean) => void };
const Ctx = createContext<Nav | null>(null);
let current: Nav | null = null;

const PATTERNS = ["/preparar/:id", "/ler/:id", "/sessao/:id"];

export function match(path: string): Record<string, string> {
  for (const p of PATTERNS) {
    const a = p.split("/");
    const b = path.split("/");
    if (a.length !== b.length) continue;
    const params: Record<string, string> = {};
    if (a.every((seg, i) => (seg.startsWith(":") ? ((params[seg.slice(1)] = decodeURIComponent(b[i])), true) : seg === b[i]))) return params;
  }
  return {};
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState<{ path: string; search: string }>({ path: "/", search: "" });
  const locRef = useRef(loc);
  locRef.current = loc;
  const stack = useRef<{ path: string; search: string }[]>([]);
  // referência estável, como o roteador do Next.js
  const go = useCallback((to: string, replace?: boolean) => {
    const [path, search = ""] = to.split("?");
    if (!replace) stack.current.push(locRef.current);
    setLoc({ path: path || "/", search });
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const onPop = () => {
      const prev = stack.current.pop();
      if (prev) setLoc(prev);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const nav: Nav = useMemo(() => ({ path: loc.path, query: new URLSearchParams(loc.search), params: match(loc.path), go }), [loc, go]);
  current = nav;
  return <Ctx.Provider value={nav}>{children}</Ctx.Provider>;
}

export function useNav(): Nav {
  const n = useContext(Ctx);
  if (!n) throw new Error("RouterProvider ausente");
  return n;
}

export function currentQuery(): URLSearchParams {
  return current?.query ?? new URLSearchParams();
}
