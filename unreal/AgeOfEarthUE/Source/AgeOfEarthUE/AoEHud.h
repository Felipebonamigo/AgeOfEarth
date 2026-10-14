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

private:
	void LoadArt();
	/** Painel 9-slice (borda 8 px do PNG) no retângulo dado. */
	void Panel(float X, float Y, float W, float H, float Alpha = 1.f);
	/** Ícone do atlas pela chave ("res/food", "unit/hoplite"...); falso se não houver. */
	bool Icon(const FString& Key, float X, float Y, float Size, const FLinearColor& Tint = FLinearColor::White);
	void Text(const FString& S, float X, float Y, int32 Size, const FLinearColor& C, bool bBold = true, bool bShadow = true);
	FVector2D Measure(const FString& S, int32 Size, bool bBold = true);
	FSlateFontInfo FontOf(int32 Size, bool bBold);
	AAoEBridgeActor* FindBridge();

	bool bArtTried = false;
	UPROPERTY() TObjectPtr<UTexture2D> IconTex;
	UPROPERTY() TObjectPtr<UTexture2D> PanelTex;
	// o item de texto do Canvas exige um UFont (de cache Runtime) além do FSlateFontInfo, senão não desenha
	UPROPERTY() TObjectPtr<class UFont> RuntimeFont;
	TMap<FString, FVector4f> IconUV;
	TSharedPtr<const struct FCompositeFont> FontBold, FontRegular;
	TWeakObjectPtr<AAoEBridgeActor> BridgeRef;
};
