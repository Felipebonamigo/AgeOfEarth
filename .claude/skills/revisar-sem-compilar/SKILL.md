---
name: revisar-sem-compilar
description: 'Confere o C++ do Unreal do Age of Earth antes do commit, porque a nuvem não compila: roda o conferidor (generated.h, GENERATED_BODY, UPROPERTY, *_API, .h × .cpp, includes e Build.cs), revisa à mão o que ele não pega e diz ao PC o que compilar. Use ao mexer em .h ou .cpp de unreal/AgeOfEarthUE/Source/AgeOfEarthUE, antes de commitar C++, ou quando o Felipe disser "vai compilar?", "confere o C++" ou "o build quebrou".'
---
# Revisar o C++ sem compilar

A nuvem edita o C++ mas não tem o Unreal. Erro bobo só aparece quando o Felipe compila no PC, e custa uma volta inteira.
Esta rotina pega o erro mecânico antes do commit. Ela não substitui a compilação: a palavra final é do PC.

## Passos

1. Rode o conferidor na raiz do repositório (Python 3, sem dependência):
   ```bash
   python3 .claude/skills/revisar-sem-compilar/conferir_cpp.py                    # o que mudou desde o HEAD
   python3 .claude/skills/revisar-sem-compilar/conferir_cpp.py --base origin/claude/ecstatic-albattani-atz7h5   # tudo o que o branch mudou
   python3 .claude/skills/revisar-sem-compilar/conferir_cpp.py --todos            # todo o C++ (leva segundos)
   ```
   Sai 1 se achou ERRO. ERRO se conserta antes do commit. AVISO se lê e decide. NOTA lembra o que conferir à mão.
   Hoje o código do `claude/ecstatic-albattani-atz7h5` passa sem erro (1 aviso: `AAoEBridgeActor::ActorToUnit` usa ponteiro de ator como chave de busca; se o ator for destruído, a
   chave fica pendurada).
2. Revise à mão a lista "O que o conferidor não pega", abaixo, só nos trechos que você mudou.
3. Pela divisão do canal (`art/meshy/canal/`), a pasta `unreal/` é da sessão local. A nuvem usa esta rotina quando o
   Felipe pedir mudança de C++ daqui, ou para revisar o C++ que a sessão local subiu. Regras do Age of Earth: a simulação
   TypeScript é a dona do jogo, e o Unreal só desenha e manda comandos pela ponte (`scripts/unreal/protocol.ts`); código
   só de editor fica em `#if WITH_EDITOR`, e tipo de módulo só de editor (ex.: `ALandscape`) nunca aparece num `UFUNCTION`
   (quebrou o alvo Game, resposta 0008); prefixo `AoE` depois do prefixo do Unreal; `Category = "AoE"`; flags `-AoE*`
   lidas com `FParse`. Antes de commitar: `unreal/AgeOfEarthUE/Config/DefaultEngine.ini` não leva o `SecurityToken` do
   AndroidFileServer (`unreal/README.md` §6).
4. Escreva no commit, ou na resposta ao Felipe, a linha "Para o PC:" que o conferidor imprime no fim: ela diz se basta o
   Live Coding ou se é preciso fechar o editor e compilar.
5. Compilar e testar no PC: pela sessão local (skill `pedido-sessao-local`), com `Build.bat AgeOfEarthUEEditor Win64 Development -Project=... -WaitMutex`
   com o editor fechado (`unreal/README.md` §5), depois `-AoEAutoTest -AoEOrderTest` com `u1-servidor.ts --humano --avancar 0`
   e a leitura da linha `AOE_ORDER` no log.
6. Se o build do PC quebrar mesmo assim, o erro que escapou vira regra nova no conferidor
   (`.claude/skills/revisar-sem-compilar/conferir_cpp.py`), com o caso real no comentário. Copie a mudança para os outros
   jogos em Unreal (Detonauto e TDFende): o arquivo é o mesmo nos três.

## O que o conferidor não pega

- Assinatura igual no .h e no .cpp: `const`, referência, tipo de cada parâmetro, `virtual` e `override`.
- `Super::` chamado nos overrides de `BeginPlay`, `EndPlay`, `Tick`, `PostInitializeComponents` e afins.
- Membro novo com valor inicial (na declaração ou no construtor); `bool` e ponteiro sem valor são lixo.
- Texto que o jogador lê é `FText` (`LOCTEXT`/`NSLOCTEXT` ou String Table; skill `traduzir`). `FString` para o resto, `FName` para id.
- No .h, declaração adiantada (`class UFoo;`) em vez de include; o include vai no .cpp, e o .cpp começa pelo próprio .h.
- `check()` só para erro de programação. Dado ruim que o jogador pode causar pede `ensure` ou retorno com `UE_LOG`.
- Remover de `TArray` dentro de um laço: de trás para frente ou `RemoveAll`.
- Tick ligado só quando precisa. Sistema novo de dano, tráfego ou efeito passa pela skill `achar-gargalo` antes de ser aprovado.
- Formato de dado salvo ou trocado entre processos. Mensagem da ponte (`scripts/unreal/protocol.ts`, `unreal/README.md` §2): mudou campo, sobe `PROTOCOL_VERSION`
  e os testes `tests/unreal-bridge.test.ts` no mesmo commit.

## Armadilhas

- O conferidor procura módulos pelo `*.Build.cs` a partir da pasta onde você está: rode sempre da raiz do repositório.
- Include de cabeçalho do motor fora da tabela do conferidor não é checado contra o `Build.cs`. Na dúvida, procure o
  módulo na página da classe na documentação da Epic ("Module") e confira o `Build.cs`.
