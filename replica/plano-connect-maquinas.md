# Plano: app Connect para máquinas de café JL05B

> Fonte analisada: `15407.isar` (banco local Isar de um app Flutter) + `.isar-lck` (arquivo de trava, sem dados).
> Abordagem: clean-room. Reconstruímos **o que o app faz**, nunca o código, marca ou textos do original.

---

## 1. O que o app original é (recon)

O arquivo é o banco local de um **app companheiro de máquina de café automática (bean-to-cup com leite)**, feito em Flutter + Isar. Há uma única coleção, `ConnectedMachine`, com **1 máquina pareada**:

| Campo | Valor encontrado | Interpretação |
|---|---|---|
| Modelo / placa | `JL05B` | Máquina OEM (provável fabricante chinês) |
| Variante | `05B-外贸(14G)` | "外贸" = versão de exportação; 14G = dose/câmara de 14 g |
| Nome BLE | `JL05B_D42787D8D15A` | Conexão por **Bluetooth Low Energy** |
| MAC | `D42787D8D15A` | Chave única junto com `machineID` |
| BLE ID (iOS) | `9EB02DE4-8EDA-51A2-C4A0-A6F727FA28C1` | Pareado a partir de um iPhone |
| Firmware IO | `IOFW_JL05B_V78.101` | Atualização de firmware (OTA) |
| IDs | `2606219255`, `219255`, `29805` | machineID / plaqueta (nameplate) / ID no servidor |
| Consumos (double) | 293,28 · 2,4 · 3553,2 | Grãos/leite/água acumulados e calibração de vazão |

### Funcionalidades deduzidas do esquema

| Área | Campos | Função no app |
|---|---|---|
| Pareamento | `bleID`, `bleName`, `macID`, `lastConnection` | Procurar e conectar a máquina via Bluetooth |
| Identificação | `aliasName`, `nameplateNum`, `machineType`, `deviceType` | Dar apelido à máquina, ver modelo e número de série |
| Manutenção | `autoCleanTime` | Agendar a limpeza automática |
| Energia | `saveEnergyTime`, `shutdownTime` | Modo economia e desligamento automático |
| Borra | `coffeePuckAlertEnable/Count`, `in/outGroundsWeight`, `in/outGroundsWarningEnable` | Alerta de gaveta de borra cheia (por contagem e por peso) |
| Consumo | `beanUsageWeight`, `milkUsageVolume`, `waterUsageVolume`, `cupUsageVolume` | Contadores de grãos, leite, água e copos |
| Calibração | `beanVelocity`, `milkVelocity`, `brewerSpec` | Vazão do moedor e do leite, tipo de grupo de extração |
| Bebidas | `beverageMark`, `ioMark` | Receitas / cardápio de bebidas habilitadas |
| Firmware | `firmwareVersion`, `ioVersion`, `uiVersion`, `firmwareIP` | Ver versões e atualizar |
| Nuvem | `serverID`, `deviceConfigID` | Sincronizar com um backend do fabricante |

**Conclusão:** o original é um app de **consumidor final** para uma máquina por vez. A Connect opera **centenas de pontos** (hospitais, aeroportos, empresas), então a versão Connect deve ser um **app de operação de frota**: o mesmo controle BLE da máquina, mais gestão de rotas, abastecimento, manutenção e indicadores.

---

## 2. Proposta: **Connect Operação**

### Público
1. **Técnico/abastecedor de campo**: chega no ponto, conecta via BLE, abastece, limpa e registra a visita.
2. **Supervisor/operações**: vê a frota, alertas, consumo e produtividade das rotas.
3. **(Fase 3) Cliente B2B**: o hospital/empresa vê o consumo e os chamados do seu ponto.

### Matriz de funcionalidades

| # | Funcionalidade | Prioridade | Origem |
|---|---|---|---|
| F1 | Login da equipe (perfis técnico / supervisor / admin) | Must | Novo |
| F2 | Cadastro de máquina: plaqueta, MAC, ponto, cliente, endereço | Must | Original (+ponto/cliente) |
| F3 | Parear via BLE, ler status e contadores | Must | Original |
| F4 | Ler e zerar contadores de grãos, leite, água e copos | Must | Original |
| F5 | Alerta de borra (peso/contagem) e confirmação de esvaziamento | Must | Original |
| F6 | Agendar limpeza automática, economia de energia e desligamento | Must | Original |
| F7 | Check-in de visita: foto, checklist, abastecimento lançado, assinatura | Must | Novo |
| F8 | Funciona offline (hospital sem sinal) e sincroniza depois | Must | Novo (o original já usa banco local) |
| F9 | Painel da frota: mapa/lista, status, última conexão, alertas | Should | Novo |
| F10 | Cardápio de bebidas por ponto (habilitar/desabilitar receitas) | Should | Original (`beverageMark`) |
| F11 | Calibração de vazão de grãos/leite com assistente passo a passo | Should | Original |
| F12 | Ver versão e atualizar firmware em lote | Should | Original |
| F13 | Rotas do dia e ordem de visitas | Should | Novo |
| F14 | Previsão de abastecimento pelo consumo médio | Could | Novo |
| F15 | Chamados de manutenção (abrir, atribuir, fechar) | Could | Novo |
| F16 | Portal do cliente B2B com relatório de consumo | Could | Novo |
| F17 | Leitura de QR na máquina para identificar o ponto | Could | Novo |

### Telas (campo, mobile)
S01 Login · S02 Rota do dia · S03 Buscar máquinas (BLE) · S04 Painel da máquina (status, contadores, alertas) · S05 Abastecimento/limpeza (checklist + fotos) · S06 Configurações da máquina (limpeza, energia, desligamento, borra) · S07 Cardápio de bebidas · S08 Calibração · S09 Firmware · S10 Histórico de visitas · S11 Pendências de sincronização

### Telas (supervisor, web)
W01 Visão geral da frota · W02 Máquina (detalhe e histórico) · W03 Pontos e clientes · W04 Equipe e rotas · W05 Relatórios de consumo · W06 Chamados

---

## 3. Arquitetura recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| App de campo | **Flutter** (iOS + Android) | Bom suporte a BLE (`flutter_blue_plus`) e mesmo ecossistema do original |
| Banco local | **Isar** ou **Drift (SQLite)** | Offline-first, fila de sincronização |
| Backend | **Supabase** (Postgres + Auth + Storage + RLS) | A equipe já usa; fotos de visita no Storage |
| Painel web | **Next.js** na Vercel | A equipe já usa |
| Notificações | FCM (push) + e-mail | Alertas de borra cheia e de máquina offline |

### Modelo de dados (resumo)
```
clientes(id, nome, cnpj)
pontos(id, cliente_id, nome, endereco, lat, lng, setor)            -- ex.: "Hospital X – Recepção 2º andar"
maquinas(id, ponto_id, plaqueta, mac, machine_id, modelo, variante,
         firmware_io, firmware_ui, apelido, ultima_conexao)
leituras(id, maquina_id, em, graos_g, leite_ml, agua_ml, copos,
         borra_entrada_g, borra_saida_g, origem)                   -- snapshot a cada conexão BLE
config_maquina(maquina_id, auto_limpeza, economia_energia, desligamento,
               alerta_borra_ativo, alerta_borra_qtd, cardapio jsonb)
visitas(id, maquina_id, tecnico_id, inicio, fim, checklist jsonb, fotos[], obs)
abastecimentos(id, visita_id, insumo, quantidade, unidade)
alertas(id, maquina_id, tipo, aberto_em, resolvido_em)
usuarios(id, nome, perfil)                                         -- RLS por perfil
```

### Ponto crítico: protocolo BLE
O app original conversa com a placa JL05B por um protocolo BLE proprietário. **Antes de tudo, peça ao fabricante/fornecedor a documentação do protocolo (serviços/características GATT e comandos)**, ou um SDK. Como a Connect é dona/operadora das máquinas, esse é o caminho limpo e mais rápido. Se não houver documentação, a alternativa é capturar o tráfego BLE das **suas próprias** máquinas (log HCI no Android) para mapear os comandos. Isso exige validação jurídica do contrato com o fornecedor.

---

## 4. Identidade visual Connect

> ⚠️ **Pendente:** não consegui acessar connectvending.com.br nem encontrar o manual da marca. Os tokens abaixo são **placeholders**. Me envie o logo (SVG/PNG), as cores oficiais (hex) e as fontes, que eu substituo e valido o contraste (WCAG AA) com o `replica-design`.

```json
{
  "color": {
    "brand.primary":   "#______",   // cor principal Connect (botões, header)
    "brand.secondary": "#______",   // cor de apoio
    "accent.coffee":   "#6B4226",   // sugestão: tom café para ícones de insumo
    "status.ok":       "#1E9E5A",
    "status.warn":     "#E8A317",   // borra quase cheia, abastecer em breve
    "status.alert":    "#D93025",   // borra cheia, máquina offline
    "bg": "#FFFFFF", "surface": "#F5F5F7", "text": "#1A1A1A", "text.muted": "#5F6368"
  },
  "font": { "heading": "<fonte Connect>", "body": "Inter" },
  "radius": { "sm": 6, "md": 12, "lg": 20 },
  "spacing": [4, 8, 12, 16, 24, 32]
}
```

**Diretrizes de UI:**
- Uso em campo, em pé, às vezes com luva: botões com no mínimo 48 px, alto contraste e modo escuro.
- Status sempre com **cor + ícone + texto** (verde OK / amarelo atenção / vermelho ação).
- Ilustrações e ícones próprios da Connect. **Nada** do original (logos, ícones, textos e telas do fabricante).
- Tom de voz: direto e operacional ("Borra cheia, esvazie antes de sair").

---

## 5. Roadmap

| Fase | Duração* | Entrega |
|---|---|---|
| 0. Protocolo | 1–2 sem | Documentação BLE do fornecedor ou mapeamento validado em 1 máquina |
| 1. MVP de campo | 4–6 sem | F1–F8: conectar, ler contadores, alertas de borra, configurações, check-in de visita offline |
| 2. Gestão | 3–4 sem | F9–F13: painel web da frota, cardápio, calibração, firmware, rotas |
| 3. Inteligência | 3–4 sem | F14–F17: previsão de abastecimento, chamados, portal do cliente, QR |
| Piloto | 2 sem | 1 hospital, 10–20 máquinas, depois rollout para os 200+ pontos |

\* Estimativa para 1–2 desenvolvedores.

### Indicadores de sucesso
- % de visitas registradas no app (meta: 100%)
- Tempo médio por visita
- Rupturas (máquina sem insumo) por mês
- Alertas de borra resolvidos em menos de X h
- Máquinas sem conexão há mais de 48 h

---

## 6. Próximos passos
1. **Me envie o manual da marca Connect** (logo, cores, fontes).
2. Peça ao fornecedor da JL05B a **documentação do protocolo BLE**.
3. Confirme o escopo do MVP (fase 1) e a plataforma (iOS, Android ou ambos).
4. Eu sigo com `/replica-architect` (schema SQL completo + rotas) e `/replica-design` (tokens finais + componentes).
