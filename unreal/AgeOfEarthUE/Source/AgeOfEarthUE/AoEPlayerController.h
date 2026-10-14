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
	/** Clique direito contextual: atacar inimigo, coletar no de recurso, senao mover (Shift = enfileirar). */
	void ContextOrder(float TileX, float TileY, bool bQueue);
	/** Retangulo de selecao em curso (px de tela); falso se nao ha arrasto. */
	bool GetDragRect(FVector2D& A, FVector2D& B) const;
	bool IsAttackMoveArmed() const { return bAttackMoveArmed; }
	bool IsBuildMenuOpen() const { return bBuildMenu; }
	const FString& PendingBuild() const { return BuildPending; }
	static const TArray<FString>& BuildList();

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
	// U2a: A + clique = atacar-mover; caixa de selecao arrastando o esquerdo; Ctrl+1..9 grava grupo, 1..9 chama
	bool bAttackMoveArmed = false;
	bool bBuildMenu = false;
	bool bMouseOnMini = false;
	FString PowerArmed;                                // poder escolhido com G: o proximo clique esquerdo no chao o usa
public:
	const FString& GetPowerArmed() const { return PowerArmed; }
private:
	FString BuildPending;
	// -AoEOrderTest: seleciona tudo, manda coletar o no mais proximo pelo caminho do clique direito e mede se as unidades chegaram perto
	int32 OrderStage = 0; float OrderT = 0.f; int32 OrderNode = 0; FVector2D OrderTile = FVector2D::ZeroVector; float OrderDist0 = 0.f; int32 OrderVill0 = 0, OrderHouse0 = 0;
	bool bDragging = false;
	FVector2D DragStart = FVector2D::ZeroVector;
	TSet<int32> Groups[10];
	FString ShotDir;
	/** Lista de tomadas do teste automatico: nome:tileX:tileY:braco:pitch:yaw (separadas por virgula). */
	struct FShot { FString Name; float X = 0, Y = 0, Arm = 6000, Pitch = -50, Yaw = -90; };
	TArray<FShot> Shots;
	int32 ShotIdx = 0;
	float ShotT = 0.f;
};
