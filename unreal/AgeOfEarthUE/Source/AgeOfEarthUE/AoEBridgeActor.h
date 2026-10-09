#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AoEBridgeActor.generated.h"

class IWebSocket;
class AStaticMeshActor;
class UMaterialInterface;
class UStaticMesh;
class FJsonObject;

/** Uma caixa que representa uma unidade ou um edificio da simulacao. */
struct FAoEVisual
{
	TWeakObjectPtr<AStaticMeshActor> Actor;
	int32 Dono = 0;
	FVector2D From = FVector2D::ZeroVector, To = FVector2D::ZeroVector;   // posicao em tiles (interpolada de From a To)
	float FromZ = 0.f, ToZ = 0.f;                                           // altura do chao em uu
	float Alpha = 1.f;
	float Yaw = 0.f;
	FVector Scale = FVector(1.f);                                           // escala da caixa (1 = 100 uu)
	bool bBuilding = false;
	int32 Serial = 0;
};

/**
 * Ponte com a simulacao TypeScript (scripts/unreal/sim-server.ts, docs/UNREAL.md): conecta por WebSocket, recebe `hello` e
 * `state`, desenha caixas coloridas pelo dono, interpola entre dois `state` e devolve comandos (`move`).
 * Unidades: 1 tile = 200 uu (X = x * 200, Y = y * 200).
 */
UCLASS()
class AAoEBridgeActor : public AActor
{
	GENERATED_BODY()

public:
	AAoEBridgeActor();

	UPROPERTY(EditAnywhere, Category = "AoE") FString Url = TEXT("ws://127.0.0.1:8790");

	int32 MyPlayer = 0;
	int32 UuPerTile = 200;
	bool bHaveState = false;
	FVector2D MyCentroidTiles = FVector2D::ZeroVector;   // centro das unidades do jogador local no ultimo state

	/** O ator e uma unidade (devolve o id da simulacao e o dono)? */
	bool UnitIdOf(const AActor* Actor, int32& OutId, int32& OutDono) const;
	TArray<int32> MyUnitIds() const;
	void SetSelected(const TSet<int32>& Ids) { Selected = Ids; }
	const TSet<int32>& GetSelected() const { return Selected; }
	void SendMove(const TArray<int32>& Ids, float TileX, float TileY);
	/** Altura do chao (Landscape) em uu, ou 0 se nao houver. */
	float GroundZ(float X, float Y) const;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void Tick(float Dt) override;

private:
	void Connect();
	void OnConnected();
	void OnError(const FString& Error);
	void OnClosed(int32 Status, const FString& Reason, bool bClean);
	void OnMessage(const FString& Msg);
	void HandleHello(const TSharedPtr<FJsonObject>& O);
	void HandleState(const TSharedPtr<FJsonObject>& O);
	AStaticMeshActor* SpawnBox(const FLinearColor& Color);
	FLinearColor PlayerColor(int32 Dono) const;
	void UpdateVisual(FAoEVisual& V, float Dt);

	TSharedPtr<IWebSocket> Socket;
	FTimerHandle ReconnectTimer;
	bool bConnected = false;
	float StateInterval = 0.1f;
	int32 StateSerial = 0;
	int32 LastTick = 0;
	TMap<int32, uint32> PlayerColors;           // 0xRRGGBB por dono
	TMap<FString, float> UnitRadius;            // em tiles, por tipo
	TMap<int32, FAoEVisual> Units, Buildings;
	TSet<int32> Selected;
	TMap<const AActor*, int32> ActorToUnit;

	UPROPERTY() TObjectPtr<UStaticMesh> CubeMesh;
	UPROPERTY() TObjectPtr<UMaterialInterface> BoxMaterial;
};
