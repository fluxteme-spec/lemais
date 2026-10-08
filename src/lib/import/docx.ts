/** Word (.docx) e texto simples, lidos no aparelho. */
import { reflowText } from "./cleanup";

export async function readDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return r.value.replace(/\n{3,}/g, "\n\n").trim();
}

export async function readPlain(file: File): Promise<string> {
  return reflowText(await file.text());
}
