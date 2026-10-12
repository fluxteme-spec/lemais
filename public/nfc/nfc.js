/* Funções puras de NFC: formatos do UID, decodificação de registros NDEF
 * e montagem dos registros a gravar. Não dependem da página (testáveis no Node). */
(function (root) {
  "use strict";

  const utf8 = new TextEncoder();

  // ---------- UID ----------

  function parseUid(input) {
    const hex = String(input || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
    if (!hex || hex.length % 2) return [];
    return hex.match(/../g);
  }

  function bytesToDecimal(bytes) {
    if (!bytes.length) return "";
    return BigInt("0x" + bytes.join("")).toString(10);
  }

  // Formatos usados por leitores RFID/NFC e sistemas de controle de acesso.
  function uidFormats(input) {
    const b = parseUid(input);
    if (!b.length) return [];
    const rev = b.slice().reverse();
    const rows = [
      ["Original", b.join(":")],
      ["Sem dois-pontos", b.join("")],
      ["Invertido (bytes)", rev.join("")],
      ["Decimal", bytesToDecimal(b)],
      ["Decimal invertido", bytesToDecimal(rev)],
    ];
    if (b.length >= 4) {
      // muitos leitores USB "teclado" enviam os 4 primeiros bytes invertidos com 10 dígitos
      rows.push(["10 dígitos (4 bytes inv.)", bytesToDecimal(rev.slice(-4)).padStart(10, "0")]);
    }
    if (b.length >= 3) {
      // formato Wiegand 26 (facility,card) a partir dos 3 bytes menos significativos
      const last3 = rev.slice(-3);
      rows.push(["Wiegand 26 (W26)", parseInt(last3[0], 16) + "," + String(parseInt(last3[1] + last3[2], 16)).padStart(5, "0")]);
    }
    rows.push(["Tamanho", b.length + " bytes"]);
    return rows;
  }

  // ---------- leitura ----------

  function toHex(view, max) {
    if (!view) return "";
    const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const n = Math.min(u8.length, max || u8.length);
    let s = "";
    for (let i = 0; i < n; i++) s += (i ? " " : "") + u8[i].toString(16).padStart(2, "0").toUpperCase();
    if (u8.length > n) s += " …";
    return s;
  }

  function decodeText(view, encoding) {
    try {
      return new TextDecoder(encoding || "utf-8", { fatal: false }).decode(view);
    } catch {
      return new TextDecoder().decode(view);
    }
  }

  function looksPrintable(s) {
    return s.length > 0 && !/[\u0000-\u0008\u000E-\u001F\uFFFD]/.test(s);
  }

  // Wi-Fi Simple Config (application/vnd.wfa.wsc): extrai SSID, senha e segurança.
  function parseWifi(view) {
    const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const out = {};
    const walk = (start, end) => {
      let i = start;
      while (i + 4 <= end) {
        const type = (u8[i] << 8) | u8[i + 1];
        const len = (u8[i + 2] << 8) | u8[i + 3];
        const v = u8.subarray(i + 4, i + 4 + len);
        if (type === 0x100e) walk(i + 4, i + 4 + len);
        else if (type === 0x1045) out.ssid = new TextDecoder().decode(v);
        else if (type === 0x1027) out.senha = new TextDecoder().decode(v);
        else if (type === 0x1003) out.auth = ({ 1: "Aberta", 2: "WPA", 0x20: "WPA2", 0x22: "WPA/WPA2" })[(v[0] << 8) | v[1]] || "outra";
        i += 4 + len;
      }
    };
    walk(0, u8.length);
    return out;
  }

  const TYPE_LABEL = {
    text: "Texto",
    url: "Link",
    "absolute-url": "Link",
    mime: "Arquivo (MIME)",
    "smart-poster": "Smart Poster",
    empty: "Vazio",
    unknown: "Desconhecido",
  };

  // Converte um NDEFRecord em um objeto simples para exibir e guardar.
  function describeRecord(rec) {
    const d = {
      tipo: TYPE_LABEL[rec.recordType] || (rec.recordType.includes(":") ? "Externo" : rec.recordType),
      recordType: rec.recordType,
      mediaType: rec.mediaType || "",
      id: rec.id || "",
      valor: "",
      hex: toHex(rec.data, 256),
      bytes: rec.data ? rec.data.byteLength : 0,
    };
    switch (rec.recordType) {
      case "text":
        d.valor = decodeText(rec.data, rec.encoding);
        d.extra = rec.lang ? "idioma: " + rec.lang : "";
        break;
      case "url":
      case "absolute-url":
        d.valor = decodeText(rec.data);
        if (/^tel:/i.test(d.valor)) d.tipo = "Telefone";
        else if (/^mailto:/i.test(d.valor)) d.tipo = "E-mail";
        else if (/^sms:/i.test(d.valor)) d.tipo = "SMS";
        else if (/^geo:/i.test(d.valor)) d.tipo = "Localização";
        else if (/wa\.me\//i.test(d.valor)) d.tipo = "WhatsApp";
        break;
      case "mime": {
        const mt = (rec.mediaType || "").toLowerCase();
        if (mt === "application/vnd.wfa.wsc") {
          const w = parseWifi(rec.data);
          d.tipo = "Wi-Fi";
          d.valor = "Rede: " + (w.ssid || "?") + "\nSenha: " + (w.senha || "(sem senha)") + "\nSegurança: " + (w.auth || "?");
        } else if (mt.includes("json")) {
          const t = decodeText(rec.data);
          try { d.valor = JSON.stringify(JSON.parse(t), null, 2); } catch { d.valor = t; }
        } else {
          const t = decodeText(rec.data);
          if (mt.startsWith("text/") || looksPrintable(t)) d.valor = t;
          if (mt.includes("vcard")) d.tipo = "Contato";
        }
        break;
      }
      case "smart-poster": {
        const inner = rec.toRecords ? rec.toRecords() : [];
        d.filhos = (inner || []).map(describeRecord);
        d.valor = d.filhos.map((f) => f.valor).filter(Boolean).join("\n");
        break;
      }
      case "empty":
        d.valor = "(registro vazio)";
        break;
      default: {
        if (rec.data) {
          const t = decodeText(rec.data);
          if (looksPrintable(t)) d.valor = t;
        }
      }
    }
    return d;
  }

  // Converte um NDEFRecord lido em NDEFRecordInit para regravar (clonar).
  function recordToInit(rec) {
    const init = { recordType: rec.recordType };
    if (rec.mediaType) init.mediaType = rec.mediaType;
    if (rec.id) init.id = rec.id;
    if (rec.recordType === "text") {
      init.data = decodeText(rec.data, rec.encoding);
      if (rec.lang) init.lang = rec.lang;
    } else if (rec.recordType === "smart-poster") {
      init.data = { records: (rec.toRecords() || []).map(recordToInit) };
    } else if (rec.data && rec.recordType !== "empty") {
      init.data = new Uint8Array(rec.data.buffer.slice(rec.data.byteOffset, rec.data.byteOffset + rec.data.byteLength));
    }
    return init;
  }

  // ---------- gravação ----------

  function tlv(type, value) {
    const v = value instanceof Uint8Array ? value : utf8.encode(value);
    const out = new Uint8Array(4 + v.length);
    out[0] = type >> 8; out[1] = type & 255; out[2] = v.length >> 8; out[3] = v.length & 255;
    out.set(v, 4);
    return out;
  }

  function concat(parts) {
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function wifiPayload(ssid, password, security) {
    const auth = { open: 0x0001, wpa: 0x0002, wpa2: 0x0020 }[security] || 0x0020;
    const enc = security === "open" ? 0x0001 : 0x0008; // nenhuma / AES
    const credential = concat([
      tlv(0x1026, new Uint8Array([1])),
      tlv(0x1045, ssid),
      tlv(0x1003, new Uint8Array([auth >> 8, auth & 255])),
      tlv(0x100f, new Uint8Array([enc >> 8, enc & 255])),
      tlv(0x1027, security === "open" ? "" : password),
      tlv(0x1020, new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff])),
    ]);
    return tlv(0x100e, credential);
  }

  function vcardEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  }

  function digits(s) {
    return String(s || "").replace(/[^\d+]/g, "");
  }

  // Monta { record, resumo } a partir dos campos do formulário. Lança Error com mensagem para o usuário.
  function buildRecord(type, f) {
    const need = (v, msg) => { if (!String(v || "").trim()) throw new Error(msg); return String(v).trim(); };
    switch (type) {
      case "text": {
        const t = need(f.text, "Escreva o texto.");
        return { record: { recordType: "text", data: t, lang: f.lang || "pt-BR" }, resumo: "Texto: " + t };
      }
      case "url": {
        let u = need(f.url, "Informe o link.");
        if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
        try { new URL(u); } catch { throw new Error("Link inválido."); }
        return { record: { recordType: "url", data: u }, resumo: "Link: " + u };
      }
      case "tel": {
        const n = digits(need(f.phone, "Informe o telefone."));
        return { record: { recordType: "url", data: "tel:" + n }, resumo: "Telefone: " + n };
      }
      case "whatsapp": {
        const n = digits(need(f.phone, "Informe o número com DDI e DDD (ex.: 5511999998888).")).replace(/^\+/, "");
        const u = "https://wa.me/" + n + (f.message ? "?text=" + encodeURIComponent(f.message) : "");
        return { record: { recordType: "url", data: u }, resumo: "WhatsApp: " + n };
      }
      case "email": {
        const to = need(f.email, "Informe o e-mail.");
        const q = [];
        if (f.subject) q.push("subject=" + encodeURIComponent(f.subject));
        if (f.body) q.push("body=" + encodeURIComponent(f.body));
        return { record: { recordType: "url", data: "mailto:" + to + (q.length ? "?" + q.join("&") : "") }, resumo: "E-mail: " + to };
      }
      case "sms": {
        const n = digits(need(f.phone, "Informe o telefone."));
        return { record: { recordType: "url", data: "sms:" + n + (f.message ? "?body=" + encodeURIComponent(f.message) : "") }, resumo: "SMS: " + n };
      }
      case "wifi": {
        const ssid = need(f.ssid, "Informe o nome da rede.");
        const sec = f.security || "wpa2";
        if (sec !== "open" && String(f.password || "").length < 8) throw new Error("A senha do Wi-Fi precisa ter pelo menos 8 caracteres.");
        return {
          record: { recordType: "mime", mediaType: "application/vnd.wfa.wsc", data: wifiPayload(ssid, f.password || "", sec) },
          resumo: "Wi-Fi: " + ssid,
        };
      }
      case "vcard": {
        const name = need(f.name, "Informe o nome.");
        const lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + vcardEscape(name), "N:" + vcardEscape(name) + ";;;;"];
        if (f.org) lines.push("ORG:" + vcardEscape(f.org));
        if (f.phone) lines.push("TEL;TYPE=CELL:" + digits(f.phone));
        if (f.email) lines.push("EMAIL:" + f.email.trim());
        if (f.site) lines.push("URL:" + f.site.trim());
        lines.push("END:VCARD");
        return { record: { recordType: "mime", mediaType: "text/vcard", data: utf8.encode(lines.join("\r\n")) }, resumo: "Contato: " + name };
      }
      case "geo": {
        const lat = Number(String(f.lat).replace(",", "."));
        const lon = Number(String(f.lon).replace(",", "."));
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || f.lat === "" || f.lon === "") {
          throw new Error("Latitude e longitude inválidas.");
        }
        return { record: { recordType: "url", data: "geo:" + lat + "," + lon }, resumo: "Local: " + lat + ", " + lon };
      }
      case "json": {
        const t = need(f.json, "Escreva o JSON.");
        let obj;
        try { obj = JSON.parse(t); } catch { throw new Error("JSON inválido."); }
        return { record: { recordType: "mime", mediaType: "application/json", data: utf8.encode(JSON.stringify(obj)) }, resumo: "JSON: " + JSON.stringify(obj).slice(0, 60) };
      }
    }
    throw new Error("Tipo desconhecido.");
  }

  // Estimativa do tamanho da mensagem NDEF (para comparar com a capacidade da tag).
  function estimateSize(records) {
    let total = 0;
    for (const r of records) {
      let payload = 0;
      let typeLen = 1;
      if (r.recordType === "text") payload = 1 + (r.lang || "pt-BR").length + utf8.encode(r.data).length;
      else if (r.recordType === "url") payload = utf8.encode(r.data).length; // prefixo comprimido economiza alguns bytes
      else if (r.data && r.data.byteLength != null) payload = r.data.byteLength;
      else if (typeof r.data === "string") payload = utf8.encode(r.data).length;
      else if (r.data && r.data.records) payload = estimateSize(r.data.records);
      if (r.mediaType) typeLen = r.mediaType.length;
      else if (r.recordType.includes(":")) typeLen = r.recordType.length;
      total += 1 + 1 + (payload > 255 ? 4 : 1) + typeLen + payload + (r.id ? 1 + r.id.length : 0);
    }
    return total;
  }

  const api = { parseUid, uidFormats, toHex, describeRecord, recordToInit, buildRecord, wifiPayload, parseWifi, estimateSize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NFC = api;
})(typeof self !== "undefined" ? self : this);
