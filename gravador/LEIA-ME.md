# Gravador: o "Plaud" pessoal no iPhone

Grava, transcreve e resume **no próprio iPhone**. Áudio, texto e resumos ficam só no aparelho.

## Como funciona
| Etapa | Onde roda |
|---|---|
| Gravação | Microfone do iPhone (Safari). A tela fica acesa sozinha durante a gravação. |
| Transcrição | Whisper rodando no Safari, na GPU do iPhone (WebGPU). O modelo é baixado uma vez e depois funciona offline. |
| Resumo rápido | Algoritmo local e instantâneo: destaques, pendências e palavras-chave. Sai automático depois da transcrição. |
| Resumo com IA | Atalho da Apple com **Usar Modelo › No Dispositivo** (Apple Intelligence). |

Também tem: busca nas transcrições, toque no horário para ouvir o trecho, edição do texto, compartilhar texto/áudio,
importar áudio (ex.: do app Gravador da Apple) e recuperação automática se o app fechar no meio da gravação.

## Instalar no iPhone
1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar › Adicionar à Tela de Início**.
3. Abra pelo ícone e permita o microfone.
4. Em **Ajustes** (dentro do app), siga o passo a passo para criar o atalho **Resumir Gravador**.

## Limitações do Safari
- Se a tela do iPhone **bloquear**, o Safari pausa o microfone. Para gravações muito longas com o celular no bolso,
  grave no app **Gravador** da Apple e use **Importar áudio**.
- O modelo de IA "No Dispositivo" da Apple aceita uns 10 minutos de fala. Para mais, use **Private Cloud Compute**
  no atalho.

## Rodar no computador (para testar)
O microfone só funciona em `https` ou `localhost`:
```bash
cd gravador && python3 -m http.server 8765   # http://localhost:8765
```
Para usar no iPhone, publique a pasta como site estático com HTTPS (ex.: Vercel, Netlify ou GitHub Pages).
