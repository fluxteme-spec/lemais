"use client";
/** IA conectada no LêMais (chave só neste navegador) + consentimento antes do primeiro envio. */
import { useCallback, useEffect, useState } from "react";
import { getConnection } from "@/lib/ai/connection";
import { PROVIDERS, type AIConnection } from "@/lib/ai/providers";
import { repo } from "@/lib/persistence";

const FLAG = "gravadorConsent";

export function useIA() {
  const [conn, setConn] = useState<AIConnection | null | undefined>(undefined);
  useEffect(() => {
    getConnection().then(setConn).catch(() => setConn(null));
  }, []);

  /** Pergunta uma vez por provedor antes de enviar texto ou áudio para a conta da pessoa. */
  const autorizar = useCallback(
    async (oQue: "texto" | "áudio"): Promise<boolean> => {
      if (!conn) return false;
      const ok = (await repo().getFlag(FLAG).catch(() => null)) === conn.provider;
      if (ok) return true;
      const nome = PROVIDERS[conn.provider].name;
      if (!confirm(`O ${oQue} desta gravação será enviado à sua conta ${nome} para a IA trabalhar. O LêMais não guarda nada disso no servidor. Continuar?`)) return false;
      await repo().setFlag(FLAG, conn.provider).catch(() => {});
      return true;
    },
    [conn],
  );

  return { conn, autorizar, nome: conn ? PROVIDERS[conn.provider].name : null };
}
