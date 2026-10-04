/** Sem contas na versão de teste: tudo fica no aparelho. */
const STATE = {
  enabled: false,
  loading: false,
  user: null,
  profile: null,
  isAdmin: false,
  needsOnboarding: false,
  blocked: false,
  sync: null,
  syncNow: async () => false,
  refreshProfile: async () => {},
  signOut: async () => ({ ok: true }),
};
export function AccountProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function useAccount() {
  return STATE;
}
export function useOnSynced(_fn: () => void) {}
export function rememberInvite(_id: string) {}
export function pendingInvite() {
  return null;
}
export function clearInvite() {}
