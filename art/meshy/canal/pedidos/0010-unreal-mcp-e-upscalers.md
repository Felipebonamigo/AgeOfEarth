# 0010 — Unreal MCP no editor e upscalers no U1M
- de: nuvem · aberto: 2026-10-14 · prioridade: média

O Felipe pediu (14/10) que os jogos passem a usar as skills novas. Com o Unreal MCP ligado, a sessão local comanda o editor
aberto (atores, materiais, Niagara, Live Coding) em vez de só scripts Python em commandlet. Os upscalers dão folga ao preset
Épico, que mediu 77 fps com 253 unidades no U1M (resposta 0008). Roteiro do MCP: `.claude/skills/ligar-unreal-mcp/SKILL.md`
(porta 8020); uso depois de ligado: skill `unreal-mcp`.

## Faça, pela ordem, e responda em `art/meshy/canal/respostas/0010.md` (pode ser em partes)
1. Ligar o Unreal MCP pela skill `ligar-unreal-mcp`. Antes de mexer no `.uproject`, confira que o UE 5.8 traz os plugins
   `ModelContextProtocol` e `AllToolsets`; se não trouxer, responda `bloqueado` com o que achou. Pronto quando `list_toolsets`
   responder com o editor aberto: diga quantos toolsets aparecem.
2. Recompile e rode `-AoEAutoTest -AoEOrderTest` para provar que nada mudou no jogo.
3. Upscalers no U1M, mesma câmera e mesmas 253 unidades da 0008 (`unreal/scripts/u1-medir.sh`): meça o preset Épico com o TSR
   (padrão). Se o DLSS ou o FSR estiverem disponíveis sem conta nova e sem aceitar termos, meça também; se pedirem login ou
   aceite, pare nesse ponto e ponha o caminho em "Para o dono". Responda com uma tabela de fps médio e p95 por upscaler e uma
   captura de cada em `unreal/capturas/u1-upscaler-<nome>.png`.
4. Diga o que, no U2c e no U2d, passaria de script para o editor ao vivo com o MCP.

Regras: só arquivos em `unreal/` e `art/meshy/`; a simulação (`src/`, `scripts/unreal/`) e os `docs/` são da nuvem.
Sem gastar créditos do Meshy. Só CC0 ou CC BY 4.0 (ou Fab/Unreal com uso em jogo), registrado em `art/meshy/catalogo.json`.
Se faltar campo na ponte, peça de volta na resposta em vez de mexer em `scripts/unreal/`.
