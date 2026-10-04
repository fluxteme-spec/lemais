"use client";

import { useEffect } from "react";
import { rememberInvite } from "@/components/Account";

/** Guarda o convite de quem abriu um link compartilhado. */
export function RememberInvite({ id }: { id: string }) {
  useEffect(() => rememberInvite(id), [id]);
  return null;
}
