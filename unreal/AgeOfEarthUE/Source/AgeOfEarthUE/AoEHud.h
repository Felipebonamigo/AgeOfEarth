#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "AoEHud.generated.h"

/** HUD do U2: barra de recursos/populacao/Era, caixa de selecao, barras de vida das unidades selecionadas e aviso de atacar-mover. */
UCLASS()
class AAoEHud : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;
};
