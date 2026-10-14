#include "AoEBridgeActor.h"
#include "Components/InstancedStaticMeshComponent.h"

#include "WebSocketsModule.h"
#include "IWebSocket.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/FileHelper.h"
#include "HAL/FileManager.h"
#include "Misc/Paths.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/StaticMesh.h"
#include "Engine/Engine.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/SkeletalMeshActor.h"
#include "Animation/AnimSequence.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "TimerManager.h"
#include "CollisionQueryParams.h"
#include "Engine/World.h"
#include "Misc/CommandLine.h"
#include "Misc/DateTime.h"
#include "HAL/PlatformMemory.h"
#include "RHI.h"
#include "Misc/PackageName.h"
#include "Misc/Parse.h"

namespace
{
	/** Pseudo-aleatorio estavel 0..1 a partir de um id (a cena nao muda a cada partida). */
	float Hash01(int32 Id, int32 Salt = 0)
	{
		uint32 H = (uint32)Id * 2654435761u + (uint32)Salt * 40503u;
		H ^= H >> 15; H *= 2246822519u; H ^= H >> 13;
		return (H & 0xFFFF) / 65535.f;
	}
}

AAoEBridgeActor::AAoEBridgeActor()
{
	PrimaryActorTick.bCanEverTick = true;
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	DiscMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	CylMesh = DiscMesh;
	PlaneMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));
	AnelMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_Anel.M_Anel"));
	EstandarteMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_Estandarte.M_Estandarte"));
	MastroMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_Mastro.M_Mastro"));
	BoxMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	auto Anim = [](const TCHAR* P) { return LoadObject<UAnimSequence>(nullptr, P); };
	AnimIdle = Anim(TEXT("/Game/Mannequins/Anims/AoE/MM_Idle.MM_Idle"));
	AnimWalk = Anim(TEXT("/Game/Mannequins/Anims/Unarmed/Walk/MF_Unarmed_Walk_Fwd.MF_Unarmed_Walk_Fwd"));
	AnimJog = Anim(TEXT("/Game/Mannequins/Anims/Unarmed/Jog/MF_Unarmed_Jog_Fwd.MF_Unarmed_Jog_Fwd"));
	for (const TCHAR* P : { TEXT("/Game/Mannequins/Anims/Unarmed/Attack/MM_Attack_01.MM_Attack_01"), TEXT("/Game/Mannequins/Anims/Unarmed/Attack/MM_Attack_02.MM_Attack_02"), TEXT("/Game/Mannequins/Anims/Unarmed/Attack/MM_Attack_03.MM_Attack_03") })
		if (UAnimSequence* A = Anim(P)) AnimAtk.Add(A);
	for (const TCHAR* P : { TEXT("/Game/Mannequins/Anims/Death/MM_Death_Front_01.MM_Death_Front_01"), TEXT("/Game/Mannequins/Anims/Death/MM_Death_Back_01.MM_Death_Back_01"), TEXT("/Game/Mannequins/Anims/Death/MM_Death_Front_02.MM_Death_Front_02") })
		if (UAnimSequence* A = Anim(P)) AnimDeath.Add(A);
}

void AAoEBridgeActor::SpawnVitrine()
{
	TArray<FString> Tipos;
	for (const TPair<FString, FAoEDef>& K : UnitDefs) if (K.Value.Skeletons.Num() > 0) Tipos.Add(K.Key);
	Tipos.Sort([&](const FString& A, const FString& B) { return UnitDefs[A].Familia + A < UnitDefs[B].Familia + B; });
	MyPlayer = 0; UuPerTile = 200; bHaveState = true; MyCentroidTiles = FVector2D(30.f, 30.f);
	VitrineZ = 30000.f;
	{
		// chao claro e plano sob a vitrine
		FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AStaticMeshActor* Fl = GetWorld()->SpawnActor<AStaticMeshActor>(FVector(30.f * 200.f, 34.f * 200.f, VitrineZ - 2.f), FRotator::ZeroRotator, Sp);
		Fl->GetStaticMeshComponent()->SetMobility(EComponentMobility::Movable);
		Fl->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")));
		Fl->SetActorScale3D(FVector(80.f, 80.f, 1.f));
		if (UMaterialInstanceDynamic* Dm = UMaterialInstanceDynamic::Create(BoxMaterial, Fl)) { Dm->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.35f, 0.38f, 0.3f)); Fl->GetStaticMeshComponent()->SetMaterial(0, Dm); }
	}
	const float Uu = (float)UuPerTile;
	int32 I = 0, Gi = 0;
	for (const FString& T : Tipos)
	{
		const FAoEDef* Def = &UnitDefs[T];
		const int32 Id = 900000 + I;
		FAoEVisual& V = Units.Add(Id);
		V.Type = T; V.Dono = 0; V.Familia = Def->Familia;
		const bool bGigante = Def->Height >= 350.f;
		FVector2D Pos;
		if (bGigante) { Pos = FVector2D(14.f + Gi * 8.f, 52.f); ++Gi; }
		else { Pos = FVector2D(14.f + (I % 8) * 3.2f, 26.f + (I / 8) * 3.6f); }
		V.Actor = SpawnVisual(V, Def, Id, PlayerColor(0), 0.f, 60.f);
		V.Yaw = Def->Yaw;
		V.From = V.To = Pos;
		V.FromZ = V.ToZ = GroundZ(Pos.X * Uu, Pos.Y * Uu);
		V.Alpha = 1.f; V.Phase = I * 0.7f; V.AnimSeed = I * 37;
		V.bMoving = (I % 3) == 1; V.Speed = V.bMoving ? 210.f : 0.f;
		V.bAttacking = (I % 3) == 2; V.Serial = -1;
		if (V.Actor.IsValid()) ActorToUnit.Add(V.Actor.Get(), Id);
		if (!bGigante) ++I;
		else ++I;
	}
	UE_LOG(LogTemp, Log, TEXT("AoE: vitrine com %d tipos"), I);
}

void AAoEBridgeActor::LoadFamilies(const TSharedPtr<FJsonObject>& Root)
{
	AnimSets.Empty(); AnimKeep.Empty();
	const TSharedPtr<FJsonObject>* Fs = nullptr;
	if (!Root->TryGetObjectField(TEXT("familias"), Fs)) return;
	for (const TPair<FString, TSharedPtr<FJsonValue>>& KV : (*Fs)->Values)
	{
		const TSharedPtr<FJsonObject> F = KV.Value->AsObject();
		if (!F.IsValid()) continue;
		// cada familia: "pasta" (/Game/Anim/<pasta>), "arquivo" (nome do glb importado) e listas de nomes de animacao por papel;
		// o caminho final e /Game/Anim/<pasta>/<arquivo>/SkeletalMeshes/<arquivo><NomeDaAnimacao>
		FString Pasta, Arq; F->TryGetStringField(TEXT("pasta"), Pasta); F->TryGetStringField(TEXT("arquivo"), Arq);
		FAnimSet S;
		auto Ler = [&](const TCHAR* Chave, TArray<UAnimSequence*>& Dest)
		{
			const TArray<TSharedPtr<FJsonValue>>* L = nullptr;
			if (!F->TryGetArrayField(Chave, L)) return;
			for (const TSharedPtr<FJsonValue>& N : *L)
			{
				FString Nome = N->AsString();
				// "outra/pasta:Nome" permite buscar numa pasta de outra familia (ex.: animacoes extras do humano)
				FString P = Pasta, A = Arq;
				FString Esq, Dir;
				if (Nome.Split(TEXT(":"), &Esq, &Dir)) { Nome = Dir; Esq.Split(TEXT("/"), &P, &A); }
				const FString Caminho = FString::Printf(TEXT("/Game/Anim/%s/%s/SkeletalMeshes/%s%s.%s%s"), *P, *A, *A, *Nome, *A, *Nome);
				if (UAnimSequence* Q = LoadObject<UAnimSequence>(nullptr, *Caminho)) { Dest.Add(Q); AnimKeep.Add(Q); }
				else UE_LOG(LogTemp, Warning, TEXT("AoE: animacao nao encontrada: %s"), *Caminho);
			}
		};
		Ler(TEXT("idle"), S.Idle); Ler(TEXT("walk"), S.Walk); Ler(TEXT("run"), S.Run); Ler(TEXT("attack"), S.Attack); Ler(TEXT("death"), S.Death);
		Ler(TEXT("gather_tree"), S.GatherTree); Ler(TEXT("gather_farm"), S.GatherFarm); Ler(TEXT("gather_mine"), S.GatherMine);
		AnimSets.Add(KV.Key, S);
		UE_LOG(LogTemp, Log, TEXT("AoE: familia %s: idle %d, andar %d, correr %d, golpe %d, morte %d"), *KV.Key, S.Idle.Num(), S.Walk.Num(), S.Run.Num(), S.Attack.Num(), S.Death.Num());
	}
}

void AAoEBridgeActor::LoadCatalog()
{
	UnitDefs.Empty(); BuildingDefs.Empty(); NodeDefs.Empty();
	FString Txt;
	const FString Path = FPaths::Combine(FPaths::ProjectDir(), TEXT("Dados"), TEXT("AoEVisuais.json"));
	if (!FFileHelper::LoadFileToString(Txt, *Path)) { UE_LOG(LogTemp, Warning, TEXT("AoE: sem %s"), *Path); return; }
	TSharedPtr<FJsonObject> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Txt), Root) || !Root.IsValid()) { UE_LOG(LogTemp, Warning, TEXT("AoE: JSON invalido em %s"), *Path); return; }
	auto Ler = [](const TSharedPtr<FJsonObject>& Grupo, TMap<FString, FAoEDef>& Out)
	{
		if (!Grupo.IsValid()) return;
		for (const auto& KV : Grupo->Values)
		{
			const TSharedPtr<FJsonObject> E = KV.Value->AsObject();
			if (!E.IsValid()) continue;
			FAoEDef D;
			const TArray<TSharedPtr<FJsonValue>>* Ms = nullptr;
			if (E->TryGetArrayField(TEXT("esqueletos"), Ms)) for (const auto& M : *Ms) D.Skeletons.Add(M->AsString());
			if (E->TryGetArrayField(TEXT("malhas"), Ms)) for (const auto& M : *Ms) D.Meshes.Add(M->AsString());
			FString Um;
			if (E->TryGetStringField(TEXT("malha"), Um)) D.Meshes.Add(Um);
			double N = 0;
			if (E->TryGetNumberField(TEXT("ajuste"), N)) D.Fit = (float)N;
			if (E->TryGetNumberField(TEXT("altura"), N)) D.Height = (float)N;
			if (E->TryGetNumberField(TEXT("yaw"), N)) D.Yaw = (float)N;
			E->TryGetStringField(TEXT("familia"), D.Familia);
			bool B = true;
			if (E->TryGetBoolField(TEXT("anel"), B)) D.bRing = B;
			if (E->TryGetBoolField(TEXT("campo"), B)) D.bField = B;
			Out.Add(FString(KV.Key), D);
		}
	};
	const TSharedPtr<FJsonObject>* G = nullptr;
	LoadFamilies(Root);
	if (Root->TryGetObjectField(TEXT("construcoes"), G)) Ler(*G, BuildingDefs);
	if (Root->TryGetObjectField(TEXT("unidades"), G)) Ler(*G, UnitDefs);
	if (Root->TryGetObjectField(TEXT("nos"), G)) Ler(*G, NodeDefs);
	UE_LOG(LogTemp, Log, TEXT("AoE: catalogo visual: %d construcoes, %d unidades, %d nos"), BuildingDefs.Num(), UnitDefs.Num(), NodeDefs.Num());
}

UStaticMesh* AAoEBridgeActor::LoadMesh(const FString& ShortPath)
{
	if (TObjectPtr<UStaticMesh>* Hit = MeshCache.Find(ShortPath)) return Hit->Get();
	FString Folder, Name;
	if (!ShortPath.Split(TEXT("/"), &Folder, &Name)) { MeshCache.Add(ShortPath, nullptr); return nullptr; }
	const FString Underscored = Name.Replace(TEXT("-"), TEXT("_"));
	const FString Obj = FString::Printf(TEXT("/Game/Meshy/%s/%s/StaticMeshes/%s.%s"), *Folder, *Name, *Underscored, *Underscored);
	UStaticMesh* M = LoadObject<UStaticMesh>(nullptr, *Obj);
	if (!M) UE_LOG(LogTemp, Warning, TEXT("AoE: malha nao encontrada: %s"), *Obj);
	MeshCache.Add(ShortPath, M);
	return M;
}

void AAoEBridgeActor::BeginPlay()
{
	Super::BeginPlay();
	FString Override;
	if (FParse::Value(FCommandLine::Get(), TEXT("AoEUrl="), Override)) Url = Override;
	LoadCatalog();
	{
		auto MakeIsm = [&](UStaticMesh* Mesh, UMaterialInterface* Mat, bool bShadow, int32 NumData)
		{
			UInstancedStaticMeshComponent* I = NewObject<UInstancedStaticMeshComponent>(this);
			I->SetStaticMesh(Mesh);
			if (Mat) I->SetMaterial(0, Mat);
			I->SetMobility(EComponentMobility::Movable);
			I->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			I->SetCastShadow(bShadow);
			I->NumCustomDataFloats = NumData;
			I->SetupAttachment(GetRootComponent());
			I->RegisterComponent();
			return I;
		};
		UStaticMesh* Sphere = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
		ArrowISM = MakeIsm(CylMesh, MastroMat, true, 0);
		StoneISM = MakeIsm(Sphere, MastroMat, true, 0);
		PuffISM = MakeIsm(Sphere, LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_Poeira.M_Poeira")), false, 2);
	}
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEVitrine"))) { SpawnVitrine(); return; }
	Connect();
}

void AAoEBridgeActor::EndPlay(const EEndPlayReason::Type Reason)
{
	GetWorldTimerManager().ClearTimer(ReconnectTimer);
	if (Socket.IsValid())
	{
		Socket->OnClosed().RemoveAll(this);
		Socket->OnConnectionError().RemoveAll(this);
		Socket->Close();
		Socket.Reset();
	}
	Super::EndPlay(Reason);
}

void AAoEBridgeActor::Connect()
{
	if (Socket.IsValid())
	{
		Socket->OnClosed().RemoveAll(this);
		Socket->OnConnectionError().RemoveAll(this);
		Socket->Close();
	}
	Socket = FWebSocketsModule::Get().CreateWebSocket(Url);
	Socket->OnConnected().AddUObject(this, &AAoEBridgeActor::OnConnected);
	Socket->OnConnectionError().AddUObject(this, &AAoEBridgeActor::OnError);
	Socket->OnClosed().AddUObject(this, &AAoEBridgeActor::OnClosed);
	Socket->OnMessage().AddUObject(this, &AAoEBridgeActor::OnMessage);
	UE_LOG(LogTemp, Log, TEXT("AoE: conectando em %s"), *Url);
	Socket->Connect();
}

void AAoEBridgeActor::OnConnected()
{
	bConnected = true;
	UE_LOG(LogTemp, Log, TEXT("AoE: conectado"));
}

void AAoEBridgeActor::OnError(const FString& Error)
{
	bConnected = false;
	UE_LOG(LogTemp, Warning, TEXT("AoE: erro de conexao: %s (tentando de novo em 2 s)"), *Error);
	GetWorldTimerManager().SetTimer(ReconnectTimer, this, &AAoEBridgeActor::Connect, 2.f, false);
}

void AAoEBridgeActor::OnClosed(int32 Status, const FString& Reason, bool bClean)
{
	bConnected = false;
	UE_LOG(LogTemp, Warning, TEXT("AoE: conexao fechada (%d %s)"), Status, *Reason);
	GetWorldTimerManager().SetTimer(ReconnectTimer, this, &AAoEBridgeActor::Connect, 2.f, false);
}

void AAoEBridgeActor::OnMessage(const FString& Msg)
{
	TSharedPtr<FJsonObject> O;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Msg), O) || !O.IsValid()) return;
	FString Type;
	if (!O->TryGetStringField(TEXT("type"), Type)) return;
	if (Type == TEXT("hello")) HandleHello(O);
	else if (Type == TEXT("state")) HandleState(O);
	else if (Type == TEXT("over")) UE_LOG(LogTemp, Log, TEXT("AoE: fim de partida"));
}

void AAoEBridgeActor::HandleHello(const TSharedPtr<FJsonObject>& O)
{
	// uma nova partida: apaga tudo o que havia
	for (auto& P : Units) if (P.Value.Actor.IsValid()) P.Value.Actor->Destroy();
	for (auto& P : Buildings) if (P.Value.Actor.IsValid()) P.Value.Actor->Destroy();
	for (auto& D : Dying) if (D.Actor.IsValid()) D.Actor->Destroy();
	for (auto& P : NodeComps) if (P.Value) P.Value->ClearInstances();
	Units.Empty(); Buildings.Empty(); Dying.Empty(); ActorToUnit.Empty(); Selected.Empty(); NodeRefs.Empty();
	MyPlayer = (int32)O->GetNumberField(TEXT("player"));
	UuPerTile = (int32)O->GetNumberField(TEXT("uuPerTile"));
	const double TickRate = FMath::Max(1.0, O->GetNumberField(TEXT("tickRate")));
	StateInterval = (float)(O->GetNumberField(TEXT("stateEvery")) / TickRate);
	PlayerColors.Empty();
	AgeNames.Empty(); BuildingTrains.Empty(); UnitNames.Empty(); BuildingNames.Empty(); SelBuilding = 0; SelBuildingType.Empty();
	const TSharedPtr<FJsonObject>* HudBT = nullptr;
	if (O->TryGetObjectField(TEXT("buildingTypes"), HudBT)) for (const TPair<FString, TSharedPtr<FJsonValue>>& KV : (*HudBT)->Values)
	{
		const TSharedPtr<FJsonObject>* D = nullptr;
		if (!KV.Value->TryGetObject(D)) continue;
		BuildingNames.Add(KV.Key, (*D)->GetStringField(TEXT("name")));
		const TArray<TSharedPtr<FJsonValue>>* Tr = nullptr;
		if ((*D)->TryGetArrayField(TEXT("trains"), Tr)) { TArray<FString> L; for (const TSharedPtr<FJsonValue>& U : *Tr) L.Add(U->AsString()); BuildingTrains.Add(KV.Key, L); }
	}
	const TSharedPtr<FJsonObject>* HudUT = nullptr;
	if (O->TryGetObjectField(TEXT("unitTypes"), HudUT)) for (const TPair<FString, TSharedPtr<FJsonValue>>& KV : (*HudUT)->Values)
	{
		const TSharedPtr<FJsonObject>* D = nullptr;
		if (KV.Value->TryGetObject(D)) UnitNames.Add(KV.Key, (*D)->GetStringField(TEXT("name")));
	}
	const TArray<TSharedPtr<FJsonValue>>* AgesArr = nullptr;
	if (O->TryGetArrayField(TEXT("ages"), AgesArr)) for (const TSharedPtr<FJsonValue>& A : *AgesArr) { const TSharedPtr<FJsonObject>* AO; if (A->TryGetObject(AO)) AgeNames.Add((*AO)->GetStringField(TEXT("name"))); }
	const TArray<TSharedPtr<FJsonValue>>* Players = nullptr;
	if (O->TryGetArrayField(TEXT("players"), Players))
		for (const auto& V : *Players)
		{
			const TSharedPtr<FJsonObject> P = V->AsObject();
			if (!P.IsValid()) continue;
			PlayerColors.Add((int32)P->GetNumberField(TEXT("id")), (uint32)P->GetNumberField(TEXT("color")));
		}
	UnitRadius.Empty(); BuildingSize.Empty();
	const TSharedPtr<FJsonObject>* UT = nullptr;
	if (O->TryGetObjectField(TEXT("unitTypes"), UT))
		for (const auto& KV : (*UT)->Values)
		{
			double R = 0.4;
			const TSharedPtr<FJsonObject> Def = KV.Value->AsObject();
			if (Def.IsValid()) Def->TryGetNumberField(TEXT("radius"), R);
			UnitRadius.Add(FString(KV.Key), (float)R);
		}
	const TSharedPtr<FJsonObject>* BT = nullptr;
	if (O->TryGetObjectField(TEXT("buildingTypes"), BT))
		for (const auto& KV : (*BT)->Values)
		{
			const TSharedPtr<FJsonObject> Def = KV.Value->AsObject();
			if (Def.IsValid()) BuildingSize.Add(FString(KV.Key), FIntPoint((int32)Def->GetNumberField(TEXT("w")), (int32)Def->GetNumberField(TEXT("h"))));
		}
	const TArray<TSharedPtr<FJsonValue>>* Nodes = nullptr;
	if (O->TryGetArrayField(TEXT("nodes"), Nodes))
		for (const auto& V : *Nodes)
		{
			const TSharedPtr<FJsonObject> N = V->AsObject();
			if (!N.IsValid()) continue;
			SpawnNode((int32)N->GetNumberField(TEXT("id")), N->GetStringField(TEXT("t")), (float)N->GetNumberField(TEXT("x")), (float)N->GetNumberField(TEXT("y")));
		}
	UE_LOG(LogTemp, Log, TEXT("AoE: hello (jogador %d, %d jogadores, state a cada %.2f s, %d nos)"), MyPlayer, PlayerColors.Num(), StateInterval, NodeRefs.Num());
}

FLinearColor AAoEBridgeActor::PlayerColor(int32 Dono) const
{
	const uint32* C = PlayerColors.Find(Dono);
	const uint32 V = C ? *C : 0x888888;
	return FLinearColor::FromSRGBColor(FColor((V >> 16) & 0xFF, (V >> 8) & 0xFF, V & 0xFF));
}

float AAoEBridgeActor::GroundZ(float X, float Y) const
{
	if (VitrineZ > -1e8f) return VitrineZ;
	FHitResult Hit;
	FCollisionObjectQueryParams Obj(ECC_WorldStatic);
	if (GetWorld()->LineTraceSingleByObjectType(Hit, FVector(X, Y, 60000.f), FVector(X, Y, -60000.f), Obj))
		return Hit.ImpactPoint.Z;
	return 0.f;
}

void AAoEBridgeActor::SpawnNode(int32 Id, const FString& Type, float X, float Y)
{
	NodeTile.Add(Id, FVector2D(X, Y));
	NodeKind.Add(Id, Type);
	const FAoEDef* Def = NodeDefs.Find(Type);
	if (!Def || Def->Meshes.Num() == 0) return;
	const FString& Short = Def->Meshes[(int32)(Hash01(Id, 1) * Def->Meshes.Num()) % Def->Meshes.Num()];
	UStaticMesh* Mesh = LoadMesh(Short);
	if (!Mesh) return;
	TObjectPtr<UHierarchicalInstancedStaticMeshComponent>* Found = NodeComps.Find(Short);
	UHierarchicalInstancedStaticMeshComponent* Comp = Found ? Found->Get() : nullptr;
	if (!Comp)
	{
		Comp = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
		Comp->SetStaticMesh(Mesh);
		Comp->SetMobility(EComponentMobility::Movable);
		Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Comp->SetCastShadow(true);
		Comp->SetupAttachment(GetRootComponent());
		Comp->RegisterComponent();
		NodeComps.Add(Short, Comp);
	}
	const FBoxSphereBounds B = Mesh->GetBounds();
	const float SizeZ = FMath::Max(1.f, B.BoxExtent.Z * 2.f);
	const float Variacao = 0.85f + 0.35f * Hash01(Id, 2);
	const float Altura = (Def->Height > 0.f ? Def->Height : 190.f) * Variacao;
	const float S = Altura / SizeZ;
	const float Uu = (float)UuPerTile;
	const float Wx = X * Uu, Wy = Y * Uu;
	const float Z = GroundZ(Wx, Wy) - (B.Origin.Z - B.BoxExtent.Z) * S - 4.f;
	const FTransform T(FRotator(0.f, Hash01(Id, 3) * 360.f + Def->Yaw, 0.f), FVector(Wx, Wy, Z), FVector(S));
	FNodeRef Ref;
	Ref.Comp = Comp;
	Ref.Index = Comp->AddInstance(T, true);
	NodeRefs.Add(Id, Ref);
}

void AAoEBridgeActor::RemoveNode(int32 Id)
{
	NodeTile.Remove(Id);
	FNodeRef* R = NodeRefs.Find(Id);
	if (!R) return;
	if (UHierarchicalInstancedStaticMeshComponent* C = R->Comp.Get())
	{
		FTransform T;
		C->GetInstanceTransform(R->Index, T, true);
		T.SetScale3D(FVector(0.001f));
		C->UpdateInstanceTransform(R->Index, T, true, true, true);
	}
	NodeRefs.Remove(Id);
}

AActor* AAoEBridgeActor::SpawnVisual(FAoEVisual& V, const FAoEDef* Def, int32 Id, const FLinearColor& Color, float FootprintCm, float RadiusCm)
{
	FActorSpawnParameters Sp;
	Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	USkeletalMesh* SkM = nullptr;
	if (Def && Def->Skeletons.Num() > 0 && !V.bBuilding)
	{
		const FString& Path = Def->Skeletons[(int32)(Hash01(Id, 7) * Def->Skeletons.Num()) % Def->Skeletons.Num()];
		if (TObjectPtr<USkeletalMesh>* Hit = SkelCache.Find(Path)) SkM = Hit->Get();
		else { SkM = LoadObject<USkeletalMesh>(nullptr, *(Path + TEXT(".") + FPackageName::GetShortName(Path))); SkelCache.Add(Path, SkM); if (!SkM) UE_LOG(LogTemp, Warning, TEXT("AoE: esqueleto nao encontrado: %s"), *Path); }
	}
	if (SkM)
	{
		ASkeletalMeshActor* SA = GetWorld()->SpawnActor<ASkeletalMeshActor>(FVector::ZeroVector, FRotator::ZeroRotator, Sp);
		USkeletalMeshComponent* K = SA->GetSkeletalMeshComponent();
		K->SetMobility(EComponentMobility::Movable);
		K->SetSkeletalMesh(SkM);
		K->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		K->SetCollisionObjectType(ECC_WorldDynamic);
		K->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
		K->SetCollisionResponseToAllChannels(ECR_Ignore);
		K->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
		K->SetCastShadow(true);
		const float MeshH = FMath::Max(1.f, SkM->GetBounds().BoxExtent.Z * 2.f);
		const float S = (Def->Height > 0.f ? Def->Height : 185.f) / MeshH;
		V.BaseScale = S;
		{
			// esqueletos de quadrupede tem os ossos fora da origem: o centro da malha volta para o ponto da unidade
			const FVector O = SkM->GetBounds().Origin;
			V.CenterOfs = FVector2D(O.X, O.Y) * S;
		}
		V.MeshHeight = Def->Height > 0.f ? Def->Height : 185.f;
		V.Lift = 0.f;
		K->SetWorldScale3D(FVector(S));
		V.Skel = K;
		V.AnimState = -1;
		auto* Disc = NewObject<UStaticMeshComponent>(SA);
		Disc->SetStaticMesh(AnelMat ? PlaneMesh.Get() : DiscMesh.Get());
		Disc->SetMobility(EComponentMobility::Movable);
		Disc->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Disc->SetCastShadow(false);
		Disc->SetupAttachment(K);
		Disc->RegisterComponent();
		UMaterialInstanceDynamic* Dm = UMaterialInstanceDynamic::Create(AnelMat ? AnelMat.Get() : BoxMaterial.Get(), SA);
		Dm->SetVectorParameterValue(TEXT("Color"), Color);
		Disc->SetMaterial(0, Dm);
		V.Disc = Disc;
		V.DiscMat = Dm;
		V.DiscRadius = RadiusCm;
		return SA;
	}
	if (Def && Def->bField && V.bBuilding)
	{
		AStaticMeshActor* FA = GetWorld()->SpawnActor<AStaticMeshActor>(FVector::ZeroVector, FRotator::ZeroRotator, Sp);
		UStaticMeshComponent* FC = FA->GetStaticMeshComponent();
		FC->SetMobility(EComponentMobility::Movable);
		FC->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")));
		if (UMaterialInterface* Campo = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Meshy/M_Campo.M_Campo"))) FC->SetMaterial(0, Campo);
		FC->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		FC->SetCastShadow(false);
		FC->SetWorldScale3D(FVector(FootprintCm * Def->Fit / 100.f, FootprintCm * Def->Fit / 100.f, 1.f));
		V.BaseScale = 1.f;
		V.MeshHeight = 30.f;
		V.Lift = 10.f;
		V.Body = FC;
		return FA;
	}
	AStaticMeshActor* A = GetWorld()->SpawnActor<AStaticMeshActor>(FVector::ZeroVector, FRotator::ZeroRotator, Sp);
	UStaticMeshComponent* C = A->GetStaticMeshComponent();
	C->SetMobility(EComponentMobility::Movable);
	C->SetCollisionObjectType(ECC_WorldDynamic);
	C->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	C->SetCollisionResponseToAllChannels(ECR_Ignore);
	C->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);

	UStaticMesh* Mesh = nullptr;
	if (Def && Def->Meshes.Num() > 0)
		Mesh = LoadMesh(Def->Meshes[(int32)(Hash01(Id, 7) * Def->Meshes.Num()) % Def->Meshes.Num()]);
	if (Mesh)
	{
		C->SetStaticMesh(Mesh);
		const FBoxSphereBounds B = Mesh->GetBounds();
		const FVector Size = B.BoxExtent * 2.f;
		float S;
		if (V.bBuilding) S = FMath::Min(FootprintCm * Def->Fit / FMath::Max(1.f, Size.X), FootprintCm * Def->Fit / FMath::Max(1.f, Size.Y));
		else S = (Def->Height > 0.f ? Def->Height : 190.f) / FMath::Max(1.f, Size.Z);
		V.BaseScale = S;
		V.MeshHeight = Size.Z * S;
		V.Lift = -(B.Origin.Z - B.BoxExtent.Z) * S;
		C->SetWorldScale3D(FVector(S));
		V.Yaw = 0.f;
	}
	else
	{
		// sem malha para o tipo: caixa na cor do dono (ver o log para saber o tipo que falta)
		C->SetStaticMesh(CubeMesh);
		UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(BoxMaterial, A);
		M->SetVectorParameterValue(TEXT("Color"), Color);
		C->SetMaterial(0, M);
		const float W = V.bBuilding ? FootprintCm * 0.9f / 100.f : FMath::Max(0.6f, RadiusCm * 2.f / 100.f);
		V.BaseScale = 1.f;
		V.MeshHeight = V.bBuilding ? 400.f : 180.f;
		V.Lift = V.MeshHeight * 0.5f;
		C->SetWorldScale3D(FVector(W, W, V.MeshHeight / 100.f));
	}
	V.Body = C;

	if (!Def || Def->bRing)
	{
		if (V.bBuilding)
		{
			// bandeira da cor do dono (mastro cinza + pano) no canto do edificio
			UStaticMeshComponent* P = NewObject<UStaticMeshComponent>(A);
			P->SetStaticMesh(MastroMat ? CylMesh.Get() : CubeMesh.Get());
			P->SetMobility(EComponentMobility::Movable);
			P->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			P->SetupAttachment(C);
			P->RegisterComponent();
			if (MastroMat) P->SetMaterial(0, MastroMat);
			else { UMaterialInstanceDynamic* Pm = UMaterialInstanceDynamic::Create(BoxMaterial, A); Pm->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.12f, 0.1f, 0.08f)); P->SetMaterial(0, Pm); }
			V.Pole = P;
		}
		UStaticMeshComponent* D = NewObject<UStaticMeshComponent>(A);
		D->SetStaticMesh(V.bBuilding ? (EstandarteMat ? PlaneMesh.Get() : CubeMesh.Get()) : (AnelMat ? PlaneMesh.Get() : DiscMesh.Get()));
		D->SetMobility(EComponentMobility::Movable);
		D->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		D->SetCastShadow(false);
		D->SetupAttachment(C);
		D->RegisterComponent();
		UMaterialInterface* Base = V.bBuilding ? (EstandarteMat ? EstandarteMat.Get() : BoxMaterial.Get()) : (AnelMat ? AnelMat.Get() : BoxMaterial.Get());
		UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, A);
		M->SetVectorParameterValue(TEXT("Color"), Color);
		if (V.bBuilding && EstandarteMat) D->SetCastShadow(true);
		D->SetMaterial(0, M);
		V.Disc = D;
		V.DiscMat = M;
		V.DiscRadius = RadiusCm;
	}
	return A;
}

void AAoEBridgeActor::HandleState(const TSharedPtr<FJsonObject>& O)
{
	++StateSerial;
	bHaveState = true;
	LastTick = (int32)O->GetNumberField(TEXT("tick"));
	HandleEffects(O);
	const TSharedPtr<FJsonObject>* MeObj = nullptr;
	if (O->TryGetObjectField(TEXT("me"), MeObj) && MeObj && MeObj->IsValid())
	{
		const TSharedPtr<FJsonObject>* Res = nullptr;
		if ((*MeObj)->TryGetObjectField(TEXT("resources"), Res)) for (const TPair<FString, TSharedPtr<FJsonValue>>& KV : (*Res)->Values) { const int32 Amount = (int32)KV.Value->AsNumber(); Resources.Add(KV.Key, Amount); }
		Pop = (int32)(*MeObj)->GetNumberField(TEXT("pop")); PopCap = (int32)(*MeObj)->GetNumberField(TEXT("popCap")); Age = (int32)(*MeObj)->GetNumberField(TEXT("age"));
		bool bAlive = true; (*MeObj)->TryGetBoolField(TEXT("alive"), bAlive); bGameOver = !bAlive;
	}
	const float Uu = (float)UuPerTile;
	FVector2D Sum = FVector2D::ZeroVector;
	int32 NMine = 0;

	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (O->TryGetArrayField(TEXT("units"), Arr))
		for (const auto& V : *Arr)
		{
			const TSharedPtr<FJsonObject> U = V->AsObject();
			if (!U.IsValid()) continue;
			const int32 Id = (int32)U->GetNumberField(TEXT("id"));
			const int32 Dono = (int32)U->GetNumberField(TEXT("o"));
			const FVector2D Pos((float)U->GetNumberField(TEXT("x")), (float)U->GetNumberField(TEXT("y")));
			FString St; U->TryGetStringField(TEXT("s"), St);
			FAoEVisual* Vis = Units.Find(Id);
			if (!Vis)
			{
				Vis = &Units.Add(Id);
				Vis->Type = U->GetStringField(TEXT("t"));
				Vis->Dono = Dono;
				const float R = UnitRadius.FindRef(Vis->Type);
				const float RadiusCm = FMath::Max(R, 0.3f) * Uu * 0.85f;
				const FAoEDef* Def = UnitDefs.Find(Vis->Type);
				if (!Def) UE_LOG(LogTemp, Warning, TEXT("AoE: unidade sem visual no catalogo: %s"), *Vis->Type);
				AActor* A = SpawnVisual(*Vis, Def, Id, PlayerColor(Dono), 0.f, RadiusCm);
				Vis->Actor = A;
				Vis->Yaw = Def ? Def->Yaw : 0.f;
				Vis->Familia = Def ? Def->Familia : FString();
				Vis->AnimSeed = (int32)(Hash01(Id, 13) * 1000.f);
				Vis->From = Pos;
				Vis->FromZ = GroundZ(Pos.X * Uu, Pos.Y * Uu);
				Vis->Alpha = 1.f;
				Vis->Phase = Hash01(Id, 9) * 6.28f;
				ActorToUnit.Add(A, Id);
			}
			else
			{
				const float A = FMath::Clamp(Vis->Alpha, 0.f, 1.f);
				Vis->From = FMath::Lerp(Vis->From, Vis->To, A);
				Vis->FromZ = FMath::Lerp(Vis->FromZ, Vis->ToZ, A);
				Vis->Alpha = 0.f;
			}
			Vis->To = Pos;
			Vis->ToZ = GroundZ(Pos.X * Uu, Pos.Y * Uu);
			const FVector2D D = Vis->To - Vis->From;
			Vis->bMoving = D.SizeSquared() > 2e-5f;
			Vis->Speed = D.Size() * Uu / FMath::Max(StateInterval, 0.02f);
			if (Vis->bMoving)
			{
				const FAoEDef* Def = UnitDefs.Find(Vis->Type);
				Vis->Yaw = FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)) + (Def ? Def->Yaw : 0.f);
			}
			int32 Atk = -1;
			if (U->TryGetNumberField(TEXT("atk"), Atk) && Atk != Vis->LastAtk && Vis->LastAtk != -2)
			{
				if (Atk > 0 && Atk != Vis->LastAtk) Vis->AttackT = 0.f;
				Vis->LastAtk = Atk;
			}
			Vis->bAttacking = St == TEXT("attack");
			Vis->GatherKind = 0;
			if (St == TEXT("gather"))
			{
				int32 Nid = -1; U->TryGetNumberField(TEXT("nid"), Nid);
				const FString* Kd = NodeKind.Find(Nid);
				const FString K = Kd ? *Kd : FString();
				Vis->GatherKind = K.Contains(TEXT("tree")) || K.Contains(TEXT("olive")) ? 1 : (K.Contains(TEXT("berry")) || K.Contains(TEXT("wheat")) || K.Contains(TEXT("farm")) || K.Contains(TEXT("fruit"))) ? 2 : 3;
			}
			double Hp = 1, Mhp = 1;
			U->TryGetNumberField(TEXT("hp"), Hp); U->TryGetNumberField(TEXT("mhp"), Mhp);
			Vis->Hp01 = Mhp > 0 ? (float)(Hp / Mhp) : 1.f;
			Vis->Serial = StateSerial;
			if (Dono == MyPlayer) { Sum += Pos; ++NMine; }
		}
	for (auto It = Units.CreateIterator(); It; ++It)
		if (It->Value.Serial != StateSerial)
		{
			AActor* A = It->Value.Actor.Get();
			if (A)
			{
				ActorToUnit.Remove(A);
				// morte: o corpo cai e some; perto de um edificio do mesmo dono e so uma guarnicao (some direto)
				bool bGuarnicao = false;
				const FVector2D P = It->Value.To;
				for (const auto& B : Buildings)
					if (B.Value.Dono == It->Value.Dono && FVector2D::Distance(P, B.Value.To) < 3.2f) { bGuarnicao = true; break; }
				if (bGuarnicao) A->Destroy();
				else
				{
					FAoEDying D; D.Actor = A; D.Start = A->GetActorLocation(); D.Yaw = It->Value.Yaw;
					if (USkeletalMeshComponent* K = It->Value.Skel.Get())
					{
						D.bSkel = true;
						const FAnimSet* FS = It->Value.Familia.IsEmpty() ? nullptr : AnimSets.Find(It->Value.Familia);
						if (FS && FS->Death.Num() > 0) PlayAnim(It->Value, FAnimSet::Pick(FS->Death, It->Value.AnimSeed), false, 1.f);
						else if (AnimDeath.Num() > 0) PlayAnim(It->Value, AnimDeath[It->Key % AnimDeath.Num()], false, 1.f);
					}
					Dying.Add(D);
					if (UStaticMeshComponent* Dc = It->Value.Disc.Get()) Dc->SetVisibility(false);
				}
			}
			Selected.Remove(It->Key);
			It.RemoveCurrent();
		}
	if (NMine > 0) MyCentroidTiles = Sum / (float)NMine;

	if (O->TryGetArrayField(TEXT("buildings"), Arr))
	{
		for (const auto& V : *Arr)
		{
			const TSharedPtr<FJsonObject> B = V->AsObject();
			if (!B.IsValid()) continue;
			const int32 Id = (int32)B->GetNumberField(TEXT("id"));
			const int32 Dono = (int32)B->GetNumberField(TEXT("o"));
			const float W = (float)B->GetNumberField(TEXT("w")), H = (float)B->GetNumberField(TEXT("h"));
			const float Prog = B->GetIntegerField(TEXT("c")) ? 1.f : FMath::Clamp((float)B->GetNumberField(TEXT("p")), 0.f, 1.f);
			const FVector2D Center((float)B->GetNumberField(TEXT("tx")) + W * 0.5f, (float)B->GetNumberField(TEXT("ty")) + H * 0.5f);
			FAoEVisual* Vis = Buildings.Find(Id);
			if (!Vis)
			{
				Vis = &Buildings.Add(Id);
				Vis->bBuilding = true;
				Vis->Type = B->GetStringField(TEXT("t"));
				Vis->Dono = Dono;
				const FAoEDef* Def = BuildingDefs.Find(Vis->Type);
				if (!Def) UE_LOG(LogTemp, Warning, TEXT("AoE: edificio sem visual no catalogo: %s"), *Vis->Type);
				Vis->Actor = SpawnVisual(*Vis, Def, Id, PlayerColor(Dono), FMath::Min(W, H) * Uu, FMath::Min(W, H) * Uu * 0.5f);
				Vis->From = Vis->To = Center;
				// a pegada nao e plana: o edificio assenta no ponto mais alto dos cantos e do centro (sem frestas de ar)
				float Zmax = -1e9f;
				const float Hx = W * Uu * 0.4f, Hy = H * Uu * 0.4f;
				for (const FVector2D& Of : { FVector2D(0, 0), FVector2D(-Hx, -Hy), FVector2D(Hx, -Hy), FVector2D(-Hx, Hy), FVector2D(Hx, Hy) })
					Zmax = FMath::Max(Zmax, GroundZ(Center.X * Uu + Of.X, Center.Y * Uu + Of.Y));
				Vis->FromZ = Vis->ToZ = Zmax - 6.f;
				Vis->Alpha = 1.f;
				Vis->Yaw = Def ? Def->Yaw : 0.f;
				UE_LOG(LogTemp, Log, TEXT("AoE: edificio %s id %d dono %d tile (%.1f, %.1f) z %.0f escala %.2f altura %.0f"), *Vis->Type, Id, Dono, Center.X, Center.Y, Vis->ToZ, Vis->BaseScale, Vis->MeshHeight);
			}
			Vis->Progress = Prog;
			double Hp = 1, Mhp = 1;
			B->TryGetNumberField(TEXT("hp"), Hp); B->TryGetNumberField(TEXT("mhp"), Mhp);
			Vis->Hp01 = Mhp > 0 ? (float)(Hp / Mhp) : 1.f;
			Vis->Serial = StateSerial;
		}
		for (auto It = Buildings.CreateIterator(); It; ++It)
			if (It->Value.Serial != StateSerial)
			{
				if (It->Value.Actor.IsValid()) It->Value.Actor->Destroy();
				It.RemoveCurrent();
			}
	}

	const TArray<TSharedPtr<FJsonValue>>* NodeArr = nullptr;
	if (O->TryGetArrayField(TEXT("nodes"), NodeArr))
		for (const auto& V : *NodeArr)
		{
			const TArray<TSharedPtr<FJsonValue>>& P = V->AsArray();
			if (P.Num() >= 2 && (int32)P[1]->AsNumber() < 0) RemoveNode((int32)P[0]->AsNumber());
		}
}

void AAoEBridgeActor::PlayAnim(FAoEVisual& V, UAnimSequence* A, bool bLoop, float Rate, float StartFrac)
{
	USkeletalMeshComponent* K = V.Skel.Get();
	if (!K || !A) return;
	K->PlayAnimation(A, bLoop);
	K->SetPlayRate(Rate);
	if (StartFrac > 0.f) K->SetPosition(A->GetPlayLength() * StartFrac, false);
}

/** Escolhe a animacao do Manny pelo estado da simulacao: golpe (vai ate o fim), correr/andar pela velocidade medida, ocioso. */
void AAoEBridgeActor::DriveSkeletal(FAoEVisual& V, int32 /*Id*/)
{
	USkeletalMeshComponent* K = V.Skel.Get();
	if (!K) return;
	const FAnimSet* FS = V.Familia.IsEmpty() ? nullptr : AnimSets.Find(V.Familia);
	const int32 Serie = (int32)(V.Phase * 7.f) & 0x7fffffff;
	const bool bTemAtaque = FS ? FS->Attack.Num() > 0 : AnimAtk.Num() > 0;
	if (V.AttackT == 0.f && bTemAtaque)
	{
		UAnimSequence* A = FS ? FAnimSet::Pick(FS->Attack, Serie) : AnimAtk[Serie % AnimAtk.Num()].Get();
		PlayAnim(V, A, false, 1.25f);
		V.AnimState = 3;
		V.AnimUntil = Clock + A->GetPlayLength() / 1.25f;
		V.AttackT = 5.f;
		return;
	}
	if (V.AnimState == 3 && Clock < V.AnimUntil) return;
	// estados: 0 ocioso, 1 andar, 2 correr, 4 coletar arvore, 5 lavoura, 6 mina
	int32 Want = V.bMoving ? (V.Speed > (FS ? 330.f : 260.f) ? 2 : 1) : 0;
	if (!V.bMoving && V.GatherKind > 0 && FS)
	{
		const TArray<UAnimSequence*>& G = V.GatherKind == 1 ? FS->GatherTree : (V.GatherKind == 2 ? FS->GatherFarm : FS->GatherMine);
		if (G.Num() > 0) Want = 3 + V.GatherKind;
	}
	if (V.bAttacking && !V.bMoving) Want = 0;
	if (Want == V.AnimState) return;
	const float Ofs = Hash01((int32)(V.Phase * 100.f), 5);
	if (FS)
	{
		const TArray<UAnimSequence*>* L = &FS->Idle; bool bLoop = true; float Rate = 1.f;
		if (Want == 2) { L = FS->Run.Num() ? &FS->Run : &FS->Walk; Rate = FMath::Clamp(V.Speed / 480.f, 0.6f, 1.8f); }
		else if (Want == 1) { L = &FS->Walk; Rate = FMath::Clamp(V.Speed / 190.f, 0.6f, 1.8f); }
		else if (Want >= 4) L = Want == 4 ? &FS->GatherTree : (Want == 5 ? &FS->GatherFarm : &FS->GatherMine);
		if (UAnimSequence* A = FAnimSet::Pick(*L, V.AnimSeed)) PlayAnim(V, A, bLoop, Rate, Ofs);
		V.AnimState = Want;
		return;
	}
	if (Want == 2) PlayAnim(V, AnimJog, true, FMath::Clamp(V.Speed / 420.f, 0.6f, 1.8f), Ofs);
	else if (Want == 1) PlayAnim(V, AnimWalk, true, FMath::Clamp(V.Speed / 170.f, 0.6f, 1.8f), Ofs);
	else PlayAnim(V, AnimIdle, true, 1.f, Ofs);
	V.AnimState = Want;
}

void AAoEBridgeActor::UpdateVisual(FAoEVisual& V, float Dt)
{
	AActor* A = V.Actor.Get();
	if (!A) return;
	V.Alpha = FMath::Min(1.f, V.Alpha + Dt / FMath::Max(StateInterval, 0.02f));
	const FVector2D P = FMath::Lerp(V.From, V.To, V.Alpha);
	float Z = FMath::Lerp(V.FromZ, V.ToZ, V.Alpha);
	FRotator Rot(0.f, V.Yaw, 0.f);
	FVector Off = FVector::ZeroVector;

	if (V.bBuilding)
	{
		// em obra: a construcao sobe do chao (a parte enterrada some sob o terreno)
		Z += V.Lift - (1.f - V.Progress) * V.MeshHeight * 0.97f;
	}
	else
	{
		Z += V.Lift;
		if (V.Skel.IsValid()) { DriveSkeletal(V, 0); }
		else if (V.bMoving)
		{
			V.Phase += Dt * 11.f;
			Z += FMath::Abs(FMath::Sin(V.Phase)) * 5.f;
			Rot.Roll = FMath::Sin(V.Phase) * 3.5f;
			Rot.Pitch = 4.f;
		}
		else if (V.bAttacking)
		{
			V.Phase += Dt * 6.f;
			Rot.Pitch = 6.f * FMath::Sin(V.Phase);
		}
		if (!V.Skel.IsValid() && V.AttackT < 0.45f)
		{
			// golpe: avanca e se inclina
			const float K = FMath::Sin(PI * V.AttackT / 0.45f);
			Off = FVector(FMath::Cos(FMath::DegreesToRadians(V.Yaw)), FMath::Sin(FMath::DegreesToRadians(V.Yaw)), 0.f) * 28.f * K;
			Rot.Pitch += 16.f * K;
			V.AttackT += Dt;
		}
	}
	V.GroundPoint = FVector(P.X * UuPerTile, P.Y * UuPerTile, FMath::Lerp(V.FromZ, V.ToZ, FMath::Clamp(V.Alpha, 0.f, 1.f)));
	if (V.Skel.IsValid() && !V.CenterOfs.IsNearlyZero()) Off -= FRotator(0.f, Rot.Yaw, 0.f).RotateVector(FVector(V.CenterOfs.X, V.CenterOfs.Y, 0.f));
	A->SetActorLocationAndRotation(FVector(P.X * UuPerTile, P.Y * UuPerTile, Z) + Off, Rot);

}

void AAoEBridgeActor::Tick(float Dt)
{
	Super::Tick(Dt);
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEVitrine")))
		for (TPair<int32, FAoEVisual>& K : Units) if (K.Value.bAttacking && K.Value.AttackT >= 4.f && FMath::Fmod(Clock + K.Key * 0.37f, 3.f) < Dt) K.Value.AttackT = 0.f;
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEVitrine")) && FMath::Fmod(Clock, 0.5f) < Dt)
	{
		// vitrine: rajada de efeitos de teste (flechas e pedras em arco, poeira de golpe e de desabamento) entre as fileiras
		FAoEProj P; P.A = FVector(14.f * 200.f, 22.f * 200.f, VitrineZ + 150.f); P.B = FVector((16.f + FMath::FRand() * 20.f) * 200.f, 30.f * 200.f, VitrineZ + 90.f);
		P.Dur = 1.0f; P.Apex = 500.f; P.bStone = FMath::FRand() < 0.3f; Projs.Add(P);
		if (FMath::Fmod(Clock, 4.f) < Dt) { AddPuffs(FVector(30.f * 200.f, 30.f * 200.f, VitrineZ), 26, 90.f, 260.f, 3.8f, 0.15f, 300.f); AddPuffs(FVector(27.f * 200.f, 29.f * 200.f, VitrineZ), 2, 35.f, 110.f, 1.4f, 0.f, 40.f); }
	}
	Clock += Dt;
	PerfAcc += Dt; ++PerfFrames; PerfWorst = FMath::Max(PerfWorst, (double)Dt);
	if (PerfAcc >= 5.0)
	{
		const double Fps = PerfFrames / PerfAcc;
		const double Gpu = FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles(0));
		const FPlatformMemoryStats Mem = FPlatformMemory::GetStats();
		const FString Linha = FString::Printf(TEXT("AOE_PERF t=%.0f fps=%.1f quadro_ms=%.2f pior_ms=%.1f gpu_ms=%.2f ram_mb=%.0f unidades=%d edificios=%d projeteis=%d poeira=%d"),
			(double)Clock, Fps, 1000.0 / FMath::Max(Fps, 0.001), PerfWorst * 1000.0, Gpu, (double)Mem.UsedPhysical / (1024.0 * 1024.0), Units.Num(), Buildings.Num(), Projs.Num(), Puffs.Num());
		UE_LOG(LogTemp, Log, TEXT("%s"), *Linha);
		if (PerfFile.IsEmpty()) FParse::Value(FCommandLine::Get(), TEXT("AoEPerfLog="), PerfFile);
		if (!PerfFile.IsEmpty()) FFileHelper::SaveStringToFile(Linha + LINE_TERMINATOR, *PerfFile, FFileHelper::EEncodingOptions::AutoDetect, &IFileManager::Get(), FILEWRITE_Append);
		PerfSumFps += Fps; PerfSumGpu += Gpu; ++PerfWindows;
		PerfAcc = 0.0; PerfFrames = 0; PerfWorst = 0.0;
	}
	TickEffects(Dt);
	for (auto& P : Units)
	{
		UpdateVisual(P.Value, Dt);
		// disco da cor do dono sob o pe (fixo no chao, alinhado ao chao local); selecionada: maior e mais viva
		if (UStaticMeshComponent* D = P.Value.Disc.Get())
		{
			const bool bSel = Selected.Contains(P.Key);
			const float R = P.Value.DiscRadius * (bSel ? 1.35f : 1.f);
			D->SetWorldScale3D(FVector(R * 2.f / 100.f, R * 2.f / 100.f, AnelMat ? 1.f : 0.02f));
			if (AActor* A = P.Value.Actor.Get())
				D->SetWorldLocation(P.Value.Skel.IsValid() ? P.Value.GroundPoint + FVector(0, 0, 4.f) : FVector(A->GetActorLocation().X, A->GetActorLocation().Y, FMath::Lerp(P.Value.FromZ, P.Value.ToZ, FMath::Clamp(P.Value.Alpha, 0.f, 1.f)) + 4.f));
			D->SetWorldRotation(FRotator::ZeroRotator);
			if (UMaterialInstanceDynamic* M = P.Value.DiscMat.Get())
			{
				M->SetVectorParameterValue(TEXT("Color"), PlayerColor(P.Value.Dono) * (AnelMat ? 1.f : (bSel ? 3.f : 1.f)));
				M->SetScalarParameterValue(TEXT("Sel"), bSel ? 1.f : 0.f);
			}
		}
	}
	for (auto& P : Buildings)
	{
		UpdateVisual(P.Value, Dt);
		if (UStaticMeshComponent* D = P.Value.Disc.Get())
		{
			// bandeira do dono no canto sudeste do edificio: mastro de 4 m e pano de 1,3 m x 0,8 m
			const FIntPoint* Sz = BuildingSize.Find(P.Value.Type);
			const float Fp = (Sz ? FMath::Min(Sz->X, Sz->Y) : 2) * (float)UuPerTile;
			AActor* A = P.Value.Actor.Get();
			if (A)
			{
				const FVector Base(P.Value.To.X * UuPerTile + Fp * 0.5f, P.Value.To.Y * UuPerTile + Fp * 0.5f, P.Value.ToZ);
				const float Sway = FMath::Sin(Clock * 2.2f + P.Key) * 4.f;
				if (UStaticMeshComponent* Po = P.Value.Pole.Get()) { Po->SetWorldScale3D(MastroMat ? FVector(0.06f, 0.06f, 4.4f) : FVector(0.07f, 0.07f, 4.2f)); Po->SetWorldLocation(Base + FVector(0, 0, 220.f)); Po->SetWorldRotation(FRotator::ZeroRotator); }
				if (EstandarteMat)
				{
					// plano em pe (Roll 90): X = comprimento do pano a partir do mastro, Y = altura; o vento esta no material
					D->SetWorldScale3D(FVector(0.85f, 0.55f, 1.f));
					D->SetWorldRotation(FRotator(0.f, 35.f, 90.f));
					D->SetWorldLocation(Base + FRotator(0.f, 35.f, 0.f).RotateVector(FVector(45.f, 0.f, 0.f)) + FVector(0, 0, 400.f));
				}
				else
				{
					D->SetWorldScale3D(FVector(0.03f, 1.3f, 0.8f));
					D->SetWorldLocation(Base + FVector(Sway, -70.f, 360.f));
					D->SetWorldRotation(FRotator(0.f, Sway * 0.6f, 0.f));
				}
			}
			if (UMaterialInstanceDynamic* M = P.Value.DiscMat.Get()) M->SetVectorParameterValue(TEXT("Color"), PlayerColor(P.Value.Dono) * (EstandarteMat ? 0.5f : 1.6f));
		}
	}
	for (int32 i = Dying.Num() - 1; i >= 0; --i)
	{
		FAoEDying& D = Dying[i];
		AActor* A = D.Actor.Get();
		if (!A) { Dying.RemoveAt(i); continue; }
		D.T += Dt;
		const float K = FMath::Clamp(D.T / 0.55f, 0.f, 1.f);
		const float Sink = FMath::Clamp((D.T - 4.f) / 2.f, 0.f, 1.f);
		if (D.bSkel) A->SetActorLocation(D.Start + FVector(0.f, 0.f, -90.f * Sink));
		else
		{
			A->SetActorRotation(FRotator(-88.f * K * K, D.Yaw, 0.f));
			A->SetActorLocation(D.Start + FVector(0.f, 0.f, -20.f * K - 150.f * Sink));
		}
		if (D.T > 6.5f) { A->Destroy(); Dying.RemoveAt(i); }
	}
	if (GEngine && !bConnected)
		GEngine->AddOnScreenDebugMessage(101, 0.f, FColor::Red,
			FString::Printf(TEXT("Age of Earth U1 | %s | tick %d | unidades %d | edificios %d | selecionadas %d"),
				bConnected ? TEXT("ponte conectada") : TEXT("sem ponte (rode: npx tsx unreal/scripts/u1-servidor.ts)"), LastTick, Units.Num(), Buildings.Num(), Selected.Num()));
}

bool AAoEBridgeActor::UnitIdOf(const AActor* Actor, int32& OutId, int32& OutDono) const
{
	if (const int32* Id = ActorToUnit.Find(Actor))
	{
		OutId = *Id;
		OutDono = Units.FindRef(*Id).Dono;
		return true;
	}
	return false;
}

TArray<int32> AAoEBridgeActor::MyUnitIds() const
{
	TArray<int32> Out;
	for (const auto& P : Units) if (P.Value.Dono == MyPlayer) Out.Add(P.Key);
	return Out;
}

void AAoEBridgeActor::SendMove(const TArray<int32>& Ids, float TileX, float TileY)
{
	if (!Socket.IsValid() || !bConnected || Ids.Num() == 0) return;
	FString IdList;
	for (int32 i = 0; i < Ids.Num(); ++i) IdList += (i ? TEXT(",") : TEXT("")) + FString::FromInt(Ids[i]);
	Socket->Send(FString::Printf(TEXT("{\"type\":\"cmd\",\"cmd\":{\"type\":\"move\",\"player\":%d,\"ids\":[%s],\"x\":%.2f,\"y\":%.2f}}"),
		MyPlayer, *IdList, TileX, TileY));
}

void AAoEBridgeActor::SendCmd(const FString& Type, const TArray<int32>& Ids, const FString& Extra, bool bQueue)
{
	if (!Socket.IsValid() || !bConnected) return;
	FString IdList;
	for (int32 i = 0; i < Ids.Num(); ++i) IdList += (i ? TEXT(",") : TEXT("")) + FString::FromInt(Ids[i]);
	FString Body = FString::Printf(TEXT("\"type\":\"%s\",\"player\":%d"), *Type, MyPlayer);
	if (Ids.Num() > 0) Body += FString::Printf(TEXT(",\"ids\":[%s]"), *IdList);
	if (!Extra.IsEmpty()) Body += TEXT(",") + Extra;
	if (bQueue) Body += TEXT(",\"queue\":true");
	Socket->Send(FString::Printf(TEXT("{\"type\":\"cmd\",\"cmd\":{%s}}"), *Body));
}

bool AAoEBridgeActor::PickTarget(float TileX, float TileY, int32& OutId, FString& OutKind) const
{
	const FVector2D P(TileX, TileY);
	float Best = 1.0f * 1.0f;
	bool bFound = false;
	for (const TPair<int32, FAoEVisual>& K : Units)
	{
		if (K.Value.Dono == MyPlayer) continue;
		const float D = FVector2D::DistSquared(FMath::Lerp(K.Value.From, K.Value.To, K.Value.Alpha), P);
		if (D < Best) { Best = D; OutId = K.Key; OutKind = TEXT("attack"); bFound = true; }
	}
	if (bFound) return true;
	for (const TPair<int32, FAoEVisual>& K : Buildings)
	{
		if (K.Value.Dono == MyPlayer) continue;
		const FIntPoint* S = BuildingSize.Find(K.Value.Type);
		const float Hw = (S ? S->X : 2) * 0.5f + 0.3f, Hh = (S ? S->Y : 2) * 0.5f + 0.3f;
		if (FMath::Abs(P.X - K.Value.To.X) <= Hw && FMath::Abs(P.Y - K.Value.To.Y) <= Hh) { OutId = K.Key; OutKind = TEXT("attack"); return true; }
	}
	Best = 0.9f * 0.9f;
	for (const TPair<int32, FVector2D>& K : NodeTile)
	{
		const float D = FVector2D::DistSquared(K.Value, P);
		if (D < Best) { Best = D; OutId = K.Key; OutKind = TEXT("gather"); bFound = true; }
	}
	return bFound;
}

bool AAoEBridgeActor::PickOwnBuilding(float TileX, float TileY, int32& OutId, FString& OutType) const
{
	for (const TPair<int32, FAoEVisual>& K : Buildings)
	{
		if (K.Value.Dono != MyPlayer) continue;
		const FIntPoint S = SizeOfBuilding(K.Value.Type);
		if (FMath::Abs(TileX - K.Value.To.X) <= S.X * 0.5f && FMath::Abs(TileY - K.Value.To.Y) <= S.Y * 0.5f) { OutId = K.Key; OutType = K.Value.Type; return true; }
	}
	return false;
}

void AAoEBridgeActor::AddPuffs(const FVector& At, int32 N, float R0, float R1, float Dur, float Dark, float Spread)
{
	for (int32 i = 0; i < N && Puffs.Num() < 400; ++i)
	{
		FAoEPuff F;
		const float Ang = FMath::FRand() * 2.f * PI;
		F.P = At + FVector(FMath::Cos(Ang), FMath::Sin(Ang), 0.f) * Spread * FMath::FRand() + FVector(0, 0, R0 * 0.6f);
		F.V = FVector(FMath::Cos(Ang) * 25.f, FMath::Sin(Ang) * 25.f, 30.f + FMath::FRand() * 40.f);
		F.R0 = R0 * (0.7f + 0.6f * FMath::FRand()); F.R1 = R1 * (0.8f + 0.5f * FMath::FRand());
		F.Dur = Dur * (0.8f + 0.4f * FMath::FRand()); F.Dark = Dark;
		Puffs.Add(F);
	}
}

void AAoEBridgeActor::HandleEffects(const TSharedPtr<FJsonObject>& O)
{
	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (!O->TryGetArrayField(TEXT("effects"), Arr)) return;
	const float Uu = (float)UuPerTile;
	for (const TSharedPtr<FJsonValue>& V : *Arr)
	{
		const TSharedPtr<FJsonObject> E = V->AsObject();
		if (!E.IsValid()) continue;
		const FString T = E->GetStringField(TEXT("type"));
		const float X = (float)E->GetNumberField(TEXT("x")) * Uu, Y = (float)E->GetNumberField(TEXT("y")) * Uu;
		if (T == TEXT("projectile"))
		{
			double Tx = 0, Ty = 0;
			E->TryGetNumberField(TEXT("tx"), Tx); E->TryGetNumberField(TEXT("ty"), Ty);
			FString Kind; E->TryGetStringField(TEXT("data"), Kind);
			FAoEProj P;
			P.A = FVector(X, Y, GroundZ(X, Y) + 150.f);
			P.B = FVector(Tx * Uu, Ty * Uu, GroundZ(Tx * Uu, Ty * Uu) + 90.f);
			const float Dist = FVector::Dist2D(P.A, P.B);
			P.bStone = Kind.Contains(TEXT("stone")) || Kind.Contains(TEXT("siege")) || Kind.Contains(TEXT("boulder")) || Kind.Contains(TEXT("rock"));
			P.Dur = FMath::Clamp(Dist / (P.bStone ? 1300.f : 2200.f), 0.3f, 1.6f);
			P.Apex = FMath::Min(Dist * (P.bStone ? 0.35f : 0.18f), 900.f);
			if (Projs.Num() < 600) Projs.Add(P);
		}
		else if (T == TEXT("hit")) AddPuffs(FVector(X, Y, GroundZ(X, Y)), 1, 25.f, 70.f, 0.8f, 0.f, 30.f);
		else if (T == TEXT("death")) AddPuffs(FVector(X, Y, GroundZ(X, Y)), 2, 35.f, 110.f, 1.4f, 0.f, 40.f);
		else if (T == TEXT("collapse")) AddPuffs(FVector(X, Y, GroundZ(X, Y)), 26, 90.f, 260.f, 3.8f, 0.15f, 300.f);
		else if (T == TEXT("splash")) AddPuffs(FVector(X, Y, GroundZ(X, Y)), 3, 30.f, 120.f, 0.9f, -0.5f, 40.f);
	}
}

void AAoEBridgeActor::TickEffects(float Dt)
{
	if (!ArrowISM || !PuffISM) return;
	// projeteis: arco parabolico de A a B, orientados pela velocidade; o pouso levanta um pouco de poeira
	TArray<FTransform> Arrows, Stones;
	for (int32 i = Projs.Num() - 1; i >= 0; --i)
	{
		FAoEProj& P = Projs[i];
		P.T += Dt;
		const float K = FMath::Clamp(P.T / P.Dur, 0.f, 1.f);
		auto At = [&](float S) { return FMath::Lerp(P.A, P.B, S) + FVector(0, 0, 4.f * P.Apex * S * (1.f - S)); };
		const FVector Pos = At(K);
		const FVector Dir = (At(FMath::Min(1.f, K + 0.02f)) - At(FMath::Max(0.f, K - 0.02f))).GetSafeNormal();
		if (K >= 1.f) { if (P.bStone) AddPuffs(P.B - FVector(0, 0, 90.f), 3, 40.f, 150.f, 1.3f, 0.1f, 50.f); Projs.RemoveAtSwap(i); continue; }
		if (P.bStone) Stones.Add(FTransform(FRotator::ZeroRotator, Pos, FVector(0.28f)));
		else Arrows.Add(FTransform(FRotationMatrix::MakeFromZ(Dir).Rotator(), Pos, FVector(0.02f, 0.02f, 0.75f)));
	}
	ArrowISM->ClearInstances(); if (Arrows.Num()) ArrowISM->AddInstances(Arrows, false, true);
	StoneISM->ClearInstances(); if (Stones.Num()) StoneISM->AddInstances(Stones, false, true);
	// poeira: cresce, sobe, desacelera e some
	PuffISM->ClearInstances();
	TArray<FTransform> Pt;
	TArray<float> Data;
	for (int32 i = Puffs.Num() - 1; i >= 0; --i)
	{
		FAoEPuff& F = Puffs[i];
		F.T += Dt;
		if (F.T >= F.Dur) { Puffs.RemoveAtSwap(i); continue; }
		const float K = F.T / F.Dur;
		F.P += F.V * Dt; F.V *= FMath::Max(0.f, 1.f - Dt * 1.5f);
		const float R = FMath::Lerp(F.R0, F.R1, 1.f - FMath::Square(1.f - K));
		Pt.Add(FTransform(FRotator::ZeroRotator, F.P, FVector(R / 50.f)));
		Data.Add(FMath::Clamp(K * 6.f, 0.f, 1.f) * (1.f - K));   // entra rapido, apaga devagar
		Data.Add(FMath::Max(0.f, F.Dark));
	}
	if (Pt.Num())
	{
		PuffISM->AddInstances(Pt, false, true);
		for (int32 i = 0; i < Pt.Num(); ++i) { PuffISM->SetCustomDataValue(i, 0, Data[i * 2], false); PuffISM->SetCustomDataValue(i, 1, Data[i * 2 + 1], i == Pt.Num() - 1); }
	}
}
