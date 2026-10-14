#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AoEBridgeActor.generated.h"

class IWebSocket;
class UStaticMesh;
class UStaticMeshComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class USkeletalMeshComponent;
class USkeletalMesh;
class UAnimSequence;
class FJsonObject;

/** Como desenhar um tipo da simulacao (carregado de Config/AoEVisuais.json). */
/** Animacoes de uma familia de esqueleto (humano, cavalo, raposa...): listas de sequencias por papel; vazio = cai no que houver. */
struct FAnimSet
{
	TArray<UAnimSequence*> Idle, Walk, Run, Attack, Death, GatherTree, GatherFarm, GatherMine;
	static UAnimSequence* Pick(const TArray<UAnimSequence*>& L, int32 K) { return L.Num() ? L[(uint32)K % (uint32)L.Num()] : nullptr; }
};

struct FAoEDef
{
	FString Familia;             // familia de animacao (chave de "familias" no catalogo); vazio = animacoes do Manny
	TArray<FString> Skeletons;   // SkeletalMesh (/Game/Unidades/SK_*) animados pelas animacoes do Manny; tem precedencia sobre Meshes
	TArray<FString> Meshes;      // caminhos curtos ("edificios/house__greek-tavern"); mais de um = variantes escolhidas pelo id
	float Fit = 0.92f;           // edificio: fracao da pegada que a malha ocupa
	float Height = 0.f;          // unidade/no: altura final em cm (0 = pela pegada)
	float Yaw = 0.f;             // giro que leva a "frente" da malha ao +X
	bool bField = false;         // edificio plano (campo de cultivo): um plano com o material M_Campo
	bool bRing = true;           // disco da cor do dono sob a malha
};

/** Uma unidade ou um edificio da simulacao na tela. */
struct FAoEVisual
{
	TWeakObjectPtr<AActor> Actor;
	TWeakObjectPtr<UStaticMeshComponent> Body;
	TWeakObjectPtr<UStaticMeshComponent> Disc;
	TWeakObjectPtr<UStaticMeshComponent> Pole;
	TWeakObjectPtr<USkeletalMeshComponent> Skel;
	int32 AnimState = -1;        // 0 ocioso, 1 andar, 2 correr, 3 golpe
	float AnimUntil = 0.f;       // o golpe em curso so e interrompido depois deste instante
	float Speed = 0.f;           // cm/s medidos entre dois states
	TWeakObjectPtr<UMaterialInstanceDynamic> DiscMat;
	FString Type;
	int32 Dono = 0;
	FVector2D From = FVector2D::ZeroVector, To = FVector2D::ZeroVector;   // posicao em tiles (interpolada de From a To)
	float FromZ = 0.f, ToZ = 0.f;                                           // altura do chao em uu
	float Alpha = 1.f;
	float Yaw = 0.f;
	float BaseScale = 1.f;       // escala uniforme da malha
	float MeshHeight = 190.f;    // altura da malha ja escalada (cm)
	float Lift = 0.f;
	float DiscRadius = 40.f;
	float Progress = 1.f;        // edificio em obra: 0..1
	float Hp01 = 1.f;
	bool bBuilding = false;
	bool bMoving = false;
	bool bAttacking = false;
	float Phase = 0.f;           // fase da passada
	float AttackT = 9.f;         // tempo desde o ultimo golpe
	int32 LastAtk = -1;
	int32 Serial = 0;
	FString Familia;             // familia de animacao (vazio = Manny)
	int32 GatherKind = 0;        // 0 nao coleta, 1 arvore, 2 lavoura, 3 mina
	int32 AnimSeed = 0;          // sorteio fixo da variante de animacao desta unidade
	FVector2D CenterOfs = FVector2D::ZeroVector;   // centro da malha esqueletica fora da origem (cavalo, raposa...), ja escalado (cm)
	FVector GroundPoint = FVector::ZeroVector;      // ponto da simulacao no chao (onde vai o disco)
};

/** Corpo que cai e some depois de uma morte. */
struct FAoEDying
{
	TWeakObjectPtr<AActor> Actor;
	float T = 0.f;
	FVector Start = FVector::ZeroVector;
	float Yaw = 0.f;
	bool bSkel = false;
};

/**
 * Ponte com a simulacao TypeScript (scripts/unreal/sim-server.ts, docs/UNREAL.md): conecta por WebSocket, recebe `hello` e
 * `state`, desenha malhas reais (Config/AoEVisuais.json) no lugar das unidades, edificios e nos de recurso, interpola entre
 * dois `state` e devolve comandos (`move`). Unidades: 1 tile = 200 uu (X = x * 200, Y = y * 200).
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
	/** Comando generico por tipo: Extra e o miolo JSON ja formatado (ex.: "\"x\":3,\"y\":4"). Ids vazio = so o extra. */
	void SendCmd(const FString& Type, const TArray<int32>& Ids, const FString& Extra, bool bQueue);
	/** O que ha sob o ponto (em tiles)? Prioridade: unidade inimiga > edificio inimigo > no de recurso. Kind: "attack" ou "gather". */
	bool PickTarget(float TileX, float TileY, int32& OutId, FString& OutKind) const;
	const TMap<int32, FAoEVisual>& GetUnits() const { return Units; }
	// dados do jogador local para o HUD (vem em state.me)
	TMap<FString, int32> Resources;
	int32 Pop = 0, PopCap = 0, Age = 0;
	TArray<FString> AgeNames;
	bool bGameOver = false;
	TMap<FString, TArray<FString>> BuildingTrains;   // tipo de edificio -> tipos de unidade que treina
	TMap<FString, FString> UnitNames, BuildingNames;
	int32 SelBuilding = 0;                            // edificio proprio selecionado (0 = nenhum)
	FString SelBuildingType;
	/** Edificio PROPRIO sob o ponto (tiles)? */
	bool PickOwnBuilding(float TileX, float TileY, int32& OutId, FString& OutType) const;
	FIntPoint SizeOfBuilding(const FString& Type) const { const FIntPoint* S = BuildingSize.Find(Type); return S ? *S : FIntPoint(2, 2); }
	const TMap<int32, FVector2D>& GetNodeTiles() const { return NodeTile; }
	const TMap<int32, FAoEVisual>& GetBuildings() const { return Buildings; }
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
	void LoadCatalog();
	UStaticMesh* LoadMesh(const FString& ShortPath);
	AActor* SpawnVisual(FAoEVisual& V, const FAoEDef* Def, int32 Id, const FLinearColor& Color, float FootprintCm, float RadiusCm);
	void SpawnNode(int32 Id, const FString& Type, float X, float Y);
	void RemoveNode(int32 Id);
	FLinearColor PlayerColor(int32 Dono) const;
	void UpdateVisual(FAoEVisual& V, float Dt);
	void DriveSkeletal(FAoEVisual& V, int32 Id);
	void PlayAnim(FAoEVisual& V, UAnimSequence* A, bool bLoop, float Rate, float StartFrac = 0.f);

	TSharedPtr<IWebSocket> Socket;
	FTimerHandle ReconnectTimer;
	bool bConnected = false;
	float StateInterval = 0.1f;
	int32 StateSerial = 0;
	int32 LastTick = 0;
	float Clock = 0.f;
	// medidor de desempenho (log a cada 5 s; resumo ao sair)
	double PerfAcc = 0.0, PerfWorst = 0.0, PerfSumFps = 0.0, PerfSumGpu = 0.0;
	int32 PerfFrames = 0, PerfWindows = 0;
	FString PerfFile;
	TMap<int32, uint32> PlayerColors;           // 0xRRGGBB por dono
	TMap<FString, float> UnitRadius;            // em tiles, por tipo
	TMap<FString, FIntPoint> BuildingSize;      // w,h em tiles por tipo
	TMap<int32, FAoEVisual> Units, Buildings;
	TArray<FAoEDying> Dying;
	TSet<int32> Selected;
	TMap<const AActor*, int32> ActorToUnit;
	TMap<FString, FAoEDef> UnitDefs, BuildingDefs, NodeDefs;

	// nos de recurso: uma malha instanciada por variante
	struct FNodeRef { TWeakObjectPtr<UHierarchicalInstancedStaticMeshComponent> Comp; int32 Index = -1; };
	TMap<int32, FNodeRef> NodeRefs;
	TMap<int32, FVector2D> NodeTile;            // posicao (tiles) de cada no, mesmo sem malha, para o clique direito
	UPROPERTY() TMap<FString, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> NodeComps;
	UPROPERTY() TMap<FString, TObjectPtr<UStaticMesh>> MeshCache;
	TMap<FString, FAnimSet> AnimSets;
	UPROPERTY() TArray<TObjectPtr<UAnimSequence>> AnimKeep;   // mantem vivas as sequencias das familias (o GC nao ve FAnimSet)
	TMap<int32, FString> NodeKind;                              // tipo do no de recurso (para escolher a animacao de coleta)
	void LoadFamilies(const TSharedPtr<FJsonObject>& Root);
	float VitrineZ = -1e9f;   // vitrine: chao plano proprio no alto (ignora o Landscape)
	void SpawnVitrine();   // -AoEVitrine: uma de cada unidade do catalogo em grade (sem simulacao), para avaliar malha/animacao
	UPROPERTY() TObjectPtr<UAnimSequence> AnimIdle;
	UPROPERTY() TObjectPtr<UAnimSequence> AnimWalk;
	UPROPERTY() TObjectPtr<UAnimSequence> AnimJog;
	UPROPERTY() TArray<TObjectPtr<UAnimSequence>> AnimAtk;
	UPROPERTY() TArray<TObjectPtr<UAnimSequence>> AnimDeath;
	UPROPERTY() TMap<FString, TObjectPtr<USkeletalMesh>> SkelCache;
	UPROPERTY() TObjectPtr<UStaticMesh> DiscMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> CubeMesh;
	UPROPERTY() TObjectPtr<UMaterialInterface> BoxMaterial;
	// cor de time (u2_cor_time.py): anel no chao, estandarte de pano e mastro de madeira; sem eles cai no disco/placa antigos
	UPROPERTY() TObjectPtr<UStaticMesh> PlaneMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> CylMesh;
	UPROPERTY() TObjectPtr<UMaterialInterface> AnelMat;
	UPROPERTY() TObjectPtr<UMaterialInterface> EstandarteMat;
	UPROPERTY() TObjectPtr<UMaterialInterface> MastroMat;
};
