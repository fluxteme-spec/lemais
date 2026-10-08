/** Medalha de apoiador (doador) do LêMais. */
export function DonorBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink px-3 py-0.5 align-middle text-sm font-semibold"
      style={{ background: "var(--marker, #f3d75a)", color: "#1c2b33" }}
    >
      <span aria-hidden>★</span> Apoiador
    </span>
  );
}
