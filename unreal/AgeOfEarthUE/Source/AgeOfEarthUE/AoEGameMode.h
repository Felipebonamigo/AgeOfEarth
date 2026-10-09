#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "AoEGameMode.generated.h"

/** Modo de jogo do cliente: camera de RTS, controlador com a entrada e o ator da ponte com a simulacao. */
UCLASS()
class AAoEGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	AAoEGameMode();
	virtual void StartPlay() override;
};
