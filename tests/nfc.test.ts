import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const NFC = require("../public/nfc/nfc.js");

const view = (u8: Uint8Array) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

describe("NFC — formatos do UID", () => {
  it("inverte a ordem dos bytes mantendo cada byte", () => {
    const f = Object.fromEntries(NFC.uidFormats("a3:2b:cc:11"));
    expect(f["Original"]).toBe("A3:2B:CC:11");
    expect(f["Sem dois-pontos"]).toBe("A32BCC11");
    expect(f["Invertido (bytes)"]).toBe("11CC2BA3");
    expect(f["Decimal invertido"]).toBe(String(0x11cc2ba3));
    expect(f["10 dígitos (4 bytes inv.)"]).toBe(String(0x11cc2ba3).padStart(10, "0"));
    expect(f["Wiegand 26 (W26)"]).toBe(`${0xcc},${String(0x2ba3).padStart(5, "0")}`);
  });

  it("aceita UID de 7 bytes e rejeita entradas inválidas", () => {
    expect(NFC.uidFormats("04 A2 1B 3C 4D 5E 80").find((r: string[]) => r[0] === "Tamanho")[1]).toBe("7 bytes");
    expect(NFC.uidFormats("")).toEqual([]);
    expect(NFC.uidFormats("ABC")).toEqual([]);
  });
});

describe("NFC — registros", () => {
  it("monta registros de gravação e valida campos", () => {
    expect(NFC.buildRecord("url", { url: "exemplo.com" }).record).toEqual({ recordType: "url", data: "https://exemplo.com" });
    expect(NFC.buildRecord("whatsapp", { phone: "+55 (11) 99999-8888", message: "Oi" }).record.data).toBe("https://wa.me/5511999998888?text=Oi");
    expect(() => NFC.buildRecord("text", { text: "  " })).toThrow("Escreva o texto.");
    expect(() => NFC.buildRecord("json", { json: "{x" })).toThrow("JSON inválido.");
    expect(() => NFC.buildRecord("wifi", { ssid: "Casa", password: "123", security: "wpa2" })).toThrow(/8 caracteres/);
  });

  it("Wi-Fi gravado é lido de volta com SSID e senha", () => {
    const { record } = NFC.buildRecord("wifi", { ssid: "Escritório", password: "senha-forte", security: "wpa2" });
    expect(NFC.parseWifi(view(record.data))).toEqual({ ssid: "Escritório", senha: "senha-forte", auth: "WPA2" });
  });

  it("descreve registros lidos de texto, link e JSON", () => {
    const enc = new TextEncoder();
    const text = NFC.describeRecord({ recordType: "text", encoding: "utf-8", lang: "pt-BR", data: view(enc.encode("Olá")) });
    expect(text).toMatchObject({ tipo: "Texto", valor: "Olá", bytes: 4 });
    const tel = NFC.describeRecord({ recordType: "url", data: view(enc.encode("tel:+5511")) });
    expect(tel.tipo).toBe("Telefone");
    const json = NFC.describeRecord({ recordType: "mime", mediaType: "application/json", data: view(enc.encode('{"a":1}')) });
    expect(json.valor).toBe('{\n  "a": 1\n}');
  });
});
