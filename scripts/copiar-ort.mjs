// Copia o motor ONNX (WebGPU/WASM) para public/ort, para o Gravador transcrever
// sem depender de CDN e funcionar offline. Roda sozinho depois do npm install.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const origem = "node_modules/onnxruntime-web/dist";
const destino = "public/ort";
const arquivos = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];

if (!existsSync(origem)) {
  console.warn("[copiar-ort] onnxruntime-web não instalado; pulando.");
} else {
  mkdirSync(destino, { recursive: true });
  for (const a of arquivos) copyFileSync(`${origem}/${a}`, `${destino}/${a}`);
  console.log(`[copiar-ort] ${arquivos.length} arquivos em ${destino}`);
}
