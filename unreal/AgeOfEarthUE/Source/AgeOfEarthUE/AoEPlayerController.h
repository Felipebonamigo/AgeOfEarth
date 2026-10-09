#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "AoEPlayerController.generated.h"

class AAoEBridgeActor;
class USpringArmComponent;
class UCameraComponent;

/** Camera de RTS: pawn invisivel com braco de camera inclinado (~50 graus), movido pelo controlador. */
UCLASS()
class AAoECameraPawn : public APawn
{
	GENERATED_BODY()
public:
	AAoECameraPawn();
	UPROPERTY() TObjectPtr<USpringArmComponent> Arm;
	UPROPERTY() TObjectPtr<UCameraComponent> Camera;
};

/**
 * Entrada do jogador: WASD/setas movem a camera, roda do mouse da zoom, clique esquerdo seleciona uma unidade nossa,
 * Q seleciona todas, clique direito manda `move` (raycast no chao -> tile -> comando pela ponte).
 * Teste automatico (-AoEAutoTest): manda as unidades andarem e tira capturas (HighResShot) em unreal/capturas/.
 */
UCLASS()
class AAoEPlayerController : public APlayerController
{
	GENERATED_BODY()
public:
	AAoEPlayerController();
	virtual void PlayerTick(float Dt) override;

	/** Console: AoEMove X Y (em tiles) manda as unidades selecionadas (ou todas as nossas). */
	UFUNCTION(Exec) void AoEMove(float TileX, float TileY);

private:
	AAoEBridgeActor* Bridge();
	void FocusCameraOnArmy();
	void RunAutoTest(float Dt);

	TWeakObjectPtr<AAoEBridgeActor> BridgeRef;
	bool bCameraPlaced = false;
	float AutoT = 0.f;
	float AutoDelay = 8.f;
	int32 AutoStage = 0;
	bool bAutoTest = false;
	FString ShotDir;
};
