/** Parâmetros da URL atual (substituído na versão de teste em página única). */
export function searchParams(): URLSearchParams {
  return new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
}
