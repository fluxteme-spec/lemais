/** Preferências do gravador neste aparelho. */
import type { MotorTranscricao } from "./store";

export interface AjustesGravador {
  modelo: string;
  idioma: string;
  atalho: string; // resumo com Apple Intelligence
  atalhoLembretes: string; // tarefas → Lembretes
  template: string;
  auto: boolean; // transcrever ao parar
  motor: MotorTranscricao; // quem transcreve por padrão
  autoIA: boolean; // gerar resumo, tarefas e mapa ao terminar a transcrição
  personaId: string; // última persona usada
  projetoId: string; // último projeto usado ("" = sem projeto)
}

export const PADRAO: AjustesGravador = {
  modelo: "onnx-community/whisper-small",
  idioma: "portuguese",
  atalho: "Resumir Gravador",
  atalhoLembretes: "Tarefas para Lembretes",
  template: "reuniao",
  auto: true,
  motor: "aparelho",
  autoIA: true,
  personaId: "gestor-operacional",
  projetoId: "",
};

const CHAVE = "lemais-gravador-ajustes";

export function lerAjustes(): AjustesGravador {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || "{}") };
  } catch {
    return { ...PADRAO };
  }
}

export function salvarAjustes(mudanca: Partial<AjustesGravador>): AjustesGravador {
  const a = { ...lerAjustes(), ...mudanca };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(a));
  } catch {}
  return a;
}
