/* Tag NFC — interface. Usa a Web NFC (NDEFReader), disponível no Chrome para Android. */
(function () {
  "use strict";

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const HISTORY_KEY = "nfc-historico-v1";
  const supported = "NDEFReader" in window;

  // ---------- utilidades ----------

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function buzz(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) if (c != null) n.append(c);
    return n;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copiado: " + (text.length > 40 ? text.slice(0, 40) + "…" : text));
    } catch {
      toast("Não foi possível copiar.");
    }
  }

  function nfcError(err) {
    if (!err) return "Erro desconhecido.";
    if (err.name === "AbortError") return "Operação cancelada.";
    if (err.name === "NotAllowedError") return "Permissão de NFC negada. Libere em: cadeado da barra de endereço → Permissões → NFC.";
    if (err.name === "NotSupportedError") return "Este aparelho não tem NFC ou ele está desligado. Ative o NFC nas configurações do celular.";
    if (err.name === "NotReadableError") return "Não foi possível acessar o NFC. Ative o NFC e tente de novo.";
    if (err.name === "NetworkError") return "A tag se afastou antes de terminar. Segure a tag parada até a confirmação.";
    if (err.name === "SecurityError") return "O NFC só funciona em página aberta e visível, por https.";
    return err.message || String(err);
  }

  // Apenas uma operação NFC por vez (ler, gravar, apagar ou bloquear).
  let current = null; // { kind, ctrl }
  function stopCurrent() {
    if (current) { current.ctrl.abort(); current = null; }
    setScanUi(false);
    setWriteUi(false);
    setToolsUi(false);
  }
  function begin(kind) {
    stopCurrent();
    const ctrl = new AbortController();
    current = { kind, ctrl };
    return ctrl;
  }
  function end(ctrl) {
    if (current && current.ctrl === ctrl) current = null;
  }

  // ---------- abas ----------

  function go(tab) {
    $$(".tab").forEach((s) => (s.hidden = s.dataset.tab !== tab));
    $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.go === tab));
    if (tab === "historico") renderHistory();
    try { localStorage.setItem("nfc-aba", tab); } catch {}
  }
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

  // ---------- suporte ----------

  if (!supported) {
    $("#unsupported").hidden = false;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    $("#unsupported-reason").textContent = ios
      ? "Você está num iPhone/iPad. A Apple não libera NFC para apps web; ainda dá para usar o conversor de UID e o histórico."
      : !window.isSecureContext
        ? "A página não está em https. O NFC só funciona em conexão segura."
        : "Este navegador não tem a Web NFC.";
    $$("#btn-scan, #btn-write, #btn-erase, #btn-lock").forEach((b) => (b.disabled = true));
  }

  // ---------- leitura ----------

  let lastInits = null;
  let lastRead = null;

  function setScanUi(on) {
    $("#btn-scan").hidden = on;
    $("#btn-stop").hidden = !on;
    $("#scan-ring").classList.toggle("active", on);
    if (!on && $("#scan-status").dataset.state === "scan") setScanStatus("Leitura parada.");
  }
  function setScanStatus(msg, state) {
    const s = $("#scan-status");
    s.textContent = msg;
    s.dataset.state = state || "";
  }

  function uidTable(table, serial) {
    const body = $("tbody", table);
    body.replaceChildren();
    const rows = NFC.uidFormats(serial);
    if (!rows.length) {
      body.append(el("tr", {}, el("td", { colspan: "2", class: "muted", text: serial ? "UID inválido." : "Esta tag não informou o número de série." })));
      return;
    }
    for (const [label, value] of rows) {
      const copyable = label !== "Tamanho";
      body.append(
        el("tr", {}, [
          el("th", { text: label }),
          el("td", {}, [
            el("code", { text: value }),
            copyable ? el("button", { class: "btn ghost tiny", text: "Copiar", "aria-label": "Copiar " + label, onclick: () => copy(value) }) : null,
          ]),
        ]),
      );
    }
  }

  function recordCard(d, depth) {
    const box = el("div", { class: "record" + (depth ? " nested" : "") });
    const head = el("div", { class: "record-head" }, [
      el("span", { class: "pill", text: d.tipo }),
      el("span", { class: "muted small", text: [d.mediaType, d.bytes + " bytes", d.id ? "id: " + d.id : "", d.extra || ""].filter(Boolean).join(" · ") }),
    ]);
    box.append(head);
    if (d.valor) {
      const isLink = /^(https?:|tel:|mailto:|sms:|geo:)/i.test(d.valor);
      box.append(
        isLink
          ? el("a", { class: "value", href: d.valor, target: "_blank", rel: "noopener", text: d.valor })
          : el("pre", { class: "value", text: d.valor }),
      );
      box.append(el("button", { class: "btn ghost tiny", text: "Copiar", onclick: () => copy(d.valor) }));
    }
    for (const f of d.filhos || []) box.append(recordCard(f, (depth || 0) + 1));
    if (d.hex) {
      box.append(el("details", {}, [el("summary", { text: "Bytes (hex)" }), el("code", { class: "hex", text: d.hex })]));
    }
    return box;
  }

  function showRead(entry) {
    lastRead = entry;
    $("#result").hidden = false;
    $("#result-time").textContent = new Date(entry.quando).toLocaleString("pt-BR");
    uidTable($("#uid-table"), entry.uid);
    const recs = $("#records");
    recs.replaceChildren();
    $("#record-count").textContent = entry.registros.length ? "(" + entry.registros.length + " registro" + (entry.registros.length > 1 ? "s" : "") + ")" : "";
    if (!entry.registros.length) recs.append(el("p", { class: "muted", text: "Tag sem conteúdo NDEF (vazia ou não formatada)." }));
    entry.registros.forEach((d) => recs.append(recordCard(d)));
    $("#btn-clone").disabled = !lastInits || !lastInits.length;
  }

  async function startScan() {
    const ctrl = begin("scan");
    const ndef = new NDEFReader();
    setScanUi(true);
    setScanStatus("Aproxime a tag da parte de trás do celular…", "scan");
    ndef.onreadingerror = () => {
      setScanStatus("A tag foi detectada, mas não deu para ler o conteúdo. Ela pode não ser NDEF; o UID aparece se o aparelho informar.", "scan");
      buzz([60, 60, 60]);
    };
    ndef.onreading = (ev) => {
      buzz(120);
      let registros = [];
      try {
        registros = ev.message.records.map(NFC.describeRecord);
        lastInits = ev.message.records.map(NFC.recordToInit);
      } catch (e) {
        lastInits = null;
        console.error(e);
      }
      const entry = { quando: Date.now(), uid: ev.serialNumber || "", registros };
      showRead(entry);
      saveHistory(entry);
      if ($("#opt-continuous").checked) {
        setScanStatus("Lida! Aproxime a próxima tag…", "scan");
      } else {
        stopCurrent();
        setScanStatus("Tag lida.");
      }
    };
    try {
      await ndef.scan({ signal: ctrl.signal });
    } catch (err) {
      end(ctrl);
      setScanUi(false);
      setScanStatus(nfcError(err));
    }
  }

  $("#btn-scan").addEventListener("click", startScan);
  $("#btn-stop").addEventListener("click", stopCurrent);
  $("#btn-copy-json").addEventListener("click", () => lastRead && copy(JSON.stringify(lastRead, null, 2)));
  $("#btn-clone").addEventListener("click", () => {
    if (!lastInits) return;
    writeList = lastInits.map((record, i) => ({ record, resumo: "Cópia: " + ((lastRead.registros[i] || {}).tipo || record.recordType) + ((lastRead.registros[i] || {}).valor ? " — " + lastRead.registros[i].valor.slice(0, 50) : "") }));
    renderList();
    go("gravar");
    toast("Conteúdo copiado. Toque em “Gravar na tag” e encoste a tag nova.");
  });

  // ---------- gravação ----------

  const FIELDS = {
    text: [["text", "Texto", "textarea", "Olá! Esta é minha tag."], ["lang", "Idioma", "input", "pt-BR"]],
    url: [["url", "Link", "url", "https://exemplo.com.br"]],
    tel: [["phone", "Telefone", "tel", "+55 11 99999-8888"]],
    whatsapp: [["phone", "Número com DDI e DDD", "tel", "5511999998888"], ["message", "Mensagem pronta (opcional)", "textarea", "Olá!"]],
    email: [["email", "Para", "email", "contato@exemplo.com"], ["subject", "Assunto (opcional)", "input", ""], ["body", "Mensagem (opcional)", "textarea", ""]],
    sms: [["phone", "Telefone", "tel", "+55 11 99999-8888"], ["message", "Mensagem (opcional)", "textarea", ""]],
    wifi: [["ssid", "Nome da rede (SSID)", "input", "MinhaRede"], ["security", "Segurança", "select:wpa2=WPA2,wpa=WPA,open=Aberta (sem senha)", ""], ["password", "Senha", "password", ""]],
    vcard: [["name", "Nome", "input", "Maria Silva"], ["org", "Empresa (opcional)", "input", ""], ["phone", "Telefone (opcional)", "tel", ""], ["email", "E-mail (opcional)", "email", ""], ["site", "Site (opcional)", "url", ""]],
    geo: [["lat", "Latitude", "decimal", "-23.5505"], ["lon", "Longitude", "decimal", "-46.6333"]],
    json: [["json", "JSON", "textarea", '{"maquina": "SN123", "local": "Recepção"}']],
  };

  let writeList = [];

  function renderFields() {
    const type = $("#w-type").value;
    const box = $("#w-fields");
    box.replaceChildren();
    for (const [name, label, kind, ph] of FIELDS[type]) {
      let input;
      if (kind === "textarea") input = el("textarea", { name, rows: "3", placeholder: ph });
      else if (kind.startsWith("select:")) {
        input = el("select", { name });
        for (const opt of kind.slice(7).split(",")) {
          const [v, t] = opt.split("=");
          input.append(el("option", { value: v, text: t }));
        }
      } else {
        const types = { url: "url", tel: "tel", email: "email", password: "password" };
        input = el("input", { name, type: types[kind] || "text", placeholder: ph, autocomplete: "off" });
        if (kind === "decimal") input.setAttribute("inputmode", "decimal");
      }
      if (name === "lang") input.value = "pt-BR";
      box.append(el("label", { class: "field" }, [el("span", { text: label }), input]));
    }
    if (type === "geo" && navigator.geolocation) {
      box.append(el("button", { class: "btn ghost small", type: "button", text: "Usar minha localização", onclick: () => {
        navigator.geolocation.getCurrentPosition(
          (p) => { $("[name=lat]", box).value = p.coords.latitude.toFixed(6); $("[name=lon]", box).value = p.coords.longitude.toFixed(6); },
          () => toast("Não foi possível obter a localização."),
        );
      } }));
    }
  }

  function formValues() {
    const f = {};
    $$("#w-fields [name]").forEach((i) => (f[i.name] = i.value));
    return f;
  }

  function renderList() {
    const ol = $("#w-list");
    ol.replaceChildren();
    writeList.forEach((item, i) => {
      ol.append(el("li", {}, [
        el("span", { text: item.resumo }),
        el("button", { class: "btn ghost tiny", text: "Remover", "aria-label": "Remover registro " + (i + 1), onclick: () => { writeList.splice(i, 1); renderList(); } }),
      ]));
    });
    $("#w-empty").hidden = writeList.length > 0;
    $("#write-status").textContent = "";
    const size = writeList.length ? NFC.estimateSize(writeList.map((x) => x.record)) : 0;
    $("#w-size").textContent = size
      ? "Tamanho aproximado: " + size + " bytes. NTAG213 ≈ 137, NTAG215 ≈ 496, NTAG216 ≈ 868, MIFARE Classic 1K ≈ 716."
      : "";
  }

  $("#w-type").addEventListener("change", renderFields);
  $("#btn-add").addEventListener("click", () => {
    try {
      writeList.push(NFC.buildRecord($("#w-type").value, formValues()));
      renderList();
      toast("Registro adicionado à lista.");
    } catch (e) {
      toast(e.message);
    }
  });
  $("#btn-clear-list").addEventListener("click", () => { writeList = []; renderList(); });

  function setWriteUi(on) {
    $("#btn-write").hidden = on;
    $("#btn-write-cancel").hidden = !on;
  }

  $("#btn-write").addEventListener("click", async () => {
    let records;
    try {
      records = writeList.length ? writeList.map((x) => x.record) : [NFC.buildRecord($("#w-type").value, formValues()).record];
    } catch (e) {
      $("#write-status").textContent = e.message;
      return;
    }
    const ctrl = begin("write");
    setWriteUi(true);
    $("#write-status").textContent = "Aproxime a tag e segure parada…";
    try {
      await new NDEFReader().write({ records }, { overwrite: $("#opt-overwrite").checked, signal: ctrl.signal });
      buzz([80, 60, 80]);
      $("#write-status").textContent = "✅ Gravado com sucesso!";
      toast("Tag gravada.");
    } catch (err) {
      $("#write-status").textContent = err.name === "NotAllowedError" && !$("#opt-overwrite").checked
        ? "A tag já tem conteúdo. Marque “Sobrescrever” para substituir."
        : "❌ " + nfcError(err);
    } finally {
      end(ctrl);
      setWriteUi(false);
    }
  });
  $("#btn-write-cancel").addEventListener("click", stopCurrent);

  // ---------- ferramentas ----------

  function setToolsUi(on) {
    $("#btn-tools-cancel").hidden = !on;
    $("#btn-erase").disabled = on || !supported;
    $("#btn-lock").disabled = on || !supported;
  }

  async function tool(kind, run, okMsg) {
    const ctrl = begin(kind);
    setToolsUi(true);
    $("#tools-status").textContent = "Aproxime a tag e segure parada…";
    try {
      await run(new NDEFReader(), ctrl.signal);
      buzz([80, 60, 80]);
      $("#tools-status").textContent = "✅ " + okMsg;
    } catch (err) {
      $("#tools-status").textContent = "❌ " + nfcError(err);
    } finally {
      end(ctrl);
      setToolsUi(false);
    }
  }

  $("#btn-erase").addEventListener("click", () =>
    tool("erase", (n, signal) => n.write({ records: [{ recordType: "empty" }] }, { signal }), "Tag apagada."),
  );
  $("#btn-lock").addEventListener("click", () => {
    if (!("makeReadOnly" in NDEFReader.prototype)) return toast("Este Chrome não permite bloquear tags (precisa da versão 100+).");
    if (!confirm("Bloquear a tag é PERMANENTE. Ela nunca mais poderá ser gravada nem apagada. Continuar?")) return;
    tool("lock", (n, signal) => n.makeReadOnly({ signal }), "Tag bloqueada (somente leitura).");
  });
  $("#btn-tools-cancel").addEventListener("click", stopCurrent);

  $("#conv-input").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    if (v) uidTable($("#conv-table"), v);
    else $("#conv-table tbody").replaceChildren();
  });

  // ---------- histórico ----------

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  }
  function saveHistory(entry) {
    const all = loadHistory();
    all.unshift(entry);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(all.slice(0, 500))); } catch {}
  }

  function renderHistory() {
    const all = loadHistory();
    const ul = $("#hist-list");
    ul.replaceChildren();
    $("#hist-empty").hidden = all.length > 0;
    $("#hist-count").textContent = all.length ? all.length + " leitura" + (all.length > 1 ? "s" : "") : "";
    for (const h of all) {
      const resumo = h.registros.map((r) => r.tipo + (r.valor ? ": " + r.valor.split("\n")[0] : "")).join(" | ") || "sem conteúdo";
      ul.append(el("li", {}, el("button", { class: "hist-item", onclick: () => { showRead(h); lastInits = null; $("#btn-clone").disabled = true; go("ler"); } }, [
        el("code", { text: (NFC.parseUid(h.uid).join("") || "UID —") }),
        el("span", { class: "muted small", text: new Date(h.quando).toLocaleString("pt-BR") }),
        el("span", { class: "hist-sum", text: resumo }),
      ])));
    }
  }

  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[";\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  $("#btn-export").addEventListener("click", () => {
    const all = loadHistory();
    if (!all.length) return toast("Histórico vazio.");
    const head = ["data_hora", "uid", "uid_sem_dois_pontos", "uid_invertido", "decimal_invertido", "tipos", "conteudo"];
    const lines = [head.join(";")];
    for (const h of all) {
      const f = Object.fromEntries(NFC.uidFormats(h.uid));
      lines.push([
        new Date(h.quando).toLocaleString("pt-BR"),
        f["Original"] || "",
        f["Sem dois-pontos"] || "",
        f["Invertido (bytes)"] || "",
        f["Decimal invertido"] || "",
        h.registros.map((r) => r.tipo).join(" | "),
        h.registros.map((r) => r.valor).join(" | "),
      ].map(csvCell).join(";"));
    }
    // BOM para o Excel abrir com acentos corretos
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "leituras-nfc-" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#btn-hist-clear").addEventListener("click", () => {
    if (!confirm("Apagar todo o histórico de leituras deste aparelho?")) return;
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
    renderHistory();
  });

  // ---------- PWA ----------

  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
    $("#install").hidden = false;
  });
  $("#install").addEventListener("click", async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice.catch(() => null);
    installEvt = null;
    $("#install").hidden = true;
  });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {}));
  }

  // O NFC para quando a página fica em segundo plano; a leitura precisa ser reiniciada.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && current) {
      stopCurrent();
      setScanStatus("Leitura pausada (app em segundo plano). Toque em “Ler tag” de novo.");
    }
  });

  // ---------- início ----------

  renderFields();
  renderList();
  let startTab = "ler";
  try { startTab = localStorage.getItem("nfc-aba") || "ler"; } catch {}
  go($('.tabs button[data-go="' + startTab + '"]') ? startTab : "ler");

  // Se a permissão já foi dada, começa a ler sem precisar tocar no botão.
  if (supported && navigator.permissions) {
    navigator.permissions.query({ name: "nfc" }).then((p) => {
      if (p.state === "granted" && startTab === "ler") startScan();
    }).catch(() => {});
  }
})();
