#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "Fonts/SlateFontInfo.h"
#include "AoEHud.generated.h"

class UTexture2D;
class AAoEBridgeActor;

/**
 * HUD do U2 desenhado no Canvas: barra de recursos em painel de bronze com a grega, ícones do atlas `hud` do jogo web e números
 * em Cinzel; painel de seleção com retratos e vida; painel do edifício com os botões de treino; menu de construção por ícones;
 * caixa de seleção e barras de vida no mundo. Tudo lido de Dados/hud em tempo de execução (u2_hud_dados.mjs), sem assets
 * importados; sem os arquivos cai no texto simples.
 */
UCLASS()
class AAoEHud : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;

	// ---- U4: menu principal e "Criar partida" (AoEMenu.cpp) ----
	/** Menu na tela (-AoEMenu): o jogo so comeca depois do "Jogar". */
	bool MenuAtivo() const { return bMenu; }
	void IniciarMenu();
	/** Clique esquerdo em (X,Y) px de tela: aciona o botao sob o ponto. */
	void MenuClick(float X, float Y);
	/** Usado pelo teste automatico (-AoEMenuTeste): aperta o botao de id dado. */
	void MenuAcao(int32 Id);
	void MenuInstalarRapido(int32 Vagas, bool bTimes);   // preenche vagas/equipes para as capturas

private:
	enum class ETela : uint8 { Principal, Criar, Carregando };
	struct FVaga { int32 Tipo = 1; int32 Deus = 0; int32 Equipe = 1; int32 Dif = 1; };   // Tipo: 0 humano, 1 bot, 2 fechada
	struct FHit { FBox2D R; int32 Id = 0; };
	bool bMenu = false, bMenuVerificado = false, bAutoJogar = false;
	ETela Tela = ETela::Principal;
	TArray<FVaga> Vagas;
	int32 MapaTipo = 0, MapaTamanho = 1, Semente = 42, EraIni = 0, EraFim = 7, Vitoria = 0;
	bool bRevelado = false;
	int32 SerieAoEnviar = -1;
	float TCarregando = 0.f;
	FString ErroMenu;
	TArray<FHit> Hits;
	void DrawMenu();
	bool Btn(const FString& Rotulo, float X, float Y, float W, float H, int32 Id, bool bAtivo = true, bool bDestaque = false, int32 Fonte = 17);
	void Ajusta(int32& Valor, int32 Passo, int32 Min, int32 Max) { Valor = FMath::Clamp(Valor + Passo, Min, Max); }
	int32 AbertasCount() const;
	int32 TamanhoMinimo(int32 Abertas) const;
	void EnviarPartida();
	void LoadArt();
	/** Painel 9-slice (borda 8 px do PNG) no retângulo dado. */
	void Panel(float X, float Y, float W, float H, float Alpha = 1.f);
	/** Ícone do atlas pela chave ("res/food", "unit/hoplite"...); falso se não houver. */
	bool Icon(const FString& Key, float X, float Y, float Size, const FLinearColor& Tint = FLinearColor::White);
	void Text(const FString& S, float X, float Y, int32 Size, const FLinearColor& C, bool bBold = true, bool bShadow = true);
	FVector2D Measure(const FString& S, int32 Size, bool bBold = true);
	FSlateFontInfo FontOf(int32 Size, bool bBold);
	AAoEBridgeActor* FindBridge();
	void DrawMinimap(AAoEBridgeActor* B, float K);
	void BuildMinimap(AAoEBridgeActor* B);
public:
	/** Retangulo do minimapa na tela (para o controlador: clique move a camera, direito manda ordem). */
	FBox2D MiniRect = FBox2D(ForceInit);
	/** Ponto da tela dentro do minimapa -> tile; falso se fora. */
	bool MiniToTile(const FVector2D& Screen, FVector2D& OutTile) const;
private:
	UPROPERTY() TObjectPtr<UTexture2D> MiniTex;
	int32 MiniSerial = -1;
	int32 MiniW = 0, MiniH = 0;

	bool bArtTried = false;
	UPROPERTY() TObjectPtr<UTexture2D> IconTex;
	UPROPERTY() TObjectPtr<UTexture2D> PanelTex;
	// o item de texto do Canvas exige um UFont (de cache Runtime) além do FSlateFontInfo, senão não desenha
	UPROPERTY() TObjectPtr<class UFont> RuntimeFont;
	TMap<FString, FVector4f> IconUV;
	TSharedPtr<const struct FCompositeFont> FontBold, FontRegular;
	TWeakObjectPtr<AAoEBridgeActor> BridgeRef;
};
