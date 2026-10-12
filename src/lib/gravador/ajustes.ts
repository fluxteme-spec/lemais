/** Preferências do gravador neste aparelho. */
export interface AjustesGravador {
  modelo: string;
  idioma: string;
  atalho: string;
  template: string;
  auto: boolean;
}

export const PADRAO: AjustesGravador = {
  modelo: "onnx-community/whisper-small",
  idioma: "portuguese",
  atalho: "Resumir Gravador",
  template: "reuniao",
  auto: true,
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
