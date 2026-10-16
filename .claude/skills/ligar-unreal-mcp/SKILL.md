---
name: ligar-unreal-mcp
description: Ligar uma vez o Unreal MCP no projeto Age of Earth, para o Claude comandar o editor aberto pela skill `unreal-mcp`. Use só na sessão do PC do Felipe, com o Unreal 5.8 instalado, quando o Felipe pedir para "ligar o MCP" ou quando a skill `unreal-mcp` não achar o servidor.
---
# Ligar o Unreal MCP no Age of Earth

Depois de ligado, a sessão do PC usa a skill `unreal-mcp`: com o editor aberto, ela cria e muda atores, materiais, Niagara e Blueprints e recompila o C++ pelo Live Coding, sem o Felipe clicar. Lógica continua em C++ e dados em texto; o MCP serve para montar cena, materiais e conferir o editor.

Só funciona no PC: a nuvem não tem o Unreal.

## Passos (uma vez por projeto)

1. Confirme que o motor tem os plugins. Em PowerShell:
   ```powershell
   Get-ChildItem "C:\Program Files\Epic Games\UE_5.8\Engine\Plugins" -Recurse -Filter ModelContextProtocol.uplugin
   Get-ChildItem "C:\Program Files\Epic Games\UE_5.8\Engine\Plugins" -Recurse -Filter AllToolsets.uplugin
   ```
   Se não achar os dois, pare e avise o Felipe: esta versão do motor não traz o servidor MCP. Não mexa no `.uproject`, porque plugin que não existe impede o projeto de abrir.
2. Com o editor fechado, acrescente ao array `Plugins` de `unreal/AgeOfEarthUE/AgeOfEarthUE.uproject`:
   ```json
   { "Name": "ModelContextProtocol", "Enabled": true, "TargetAllowList": ["Editor"] },
   { "Name": "AllToolsets", "Enabled": true, "TargetAllowList": ["Editor"] }
   ```
   `TargetAllowList` deixa os dois fora do jogo empacotado.
3. Crie ou complete `unreal/AgeOfEarthUE/Config/DefaultEditorPerProjectUserSettings.ini` com:
   ```ini
   [/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]
   bAutoStartServer=True
   ServerPortNumber=8020
   ServerUrlPath=/mcp
   ```
   A porta 8020 é só deste jogo (Detonauto 8010, Age of Earth 8020, TDFende 8030), para dois editores abertos não brigarem.
4. Registre o servidor no Claude Code do PC, na raiz do repositório, sem criar arquivo no git:
   ```powershell
   claude mcp add --transport http unreal-mcp-ageofearth http://127.0.0.1:8020/mcp
   ```
5. Abra o editor, reinicie a sessão do Claude e confira com a skill `unreal-mcp`: `list_toolsets` precisa responder. Se não responder, rode `ModelContextProtocol.StartServer` no console do editor e veja o Output Log.
6. Compile e rode os testes como de costume (a skill `verificar`) para provar que nada mudou no jogo.
7. Commit pequeno: o `.uproject` e o `.ini`, com a mensagem "Liga o Unreal MCP no editor (só no editor)".

## Regras de uso

- Salve o projeto antes e depois de mudança em vários assets: nem tudo que o MCP faz tem desfazer.
- Espere a compilação terminar antes de chamar ferramentas; para C++, use o Live Coding pelo MCP e leia o resultado.
- Confira o resultado de cada chamada; o que não for sucesso explícito é parada.
- Pare o Play-in-Editor antes de criar assets.
