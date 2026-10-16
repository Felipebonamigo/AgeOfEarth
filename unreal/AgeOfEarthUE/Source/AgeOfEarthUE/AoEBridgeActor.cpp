#include "AoEBridgeActor.h"
#include "Components/PointLightComponent.h"
#include "Engine/DecalActor.h"
#include "EngineUtils.h"
#include "AoETerreno.h"
#include "Components/DecalComponent.h"
#include "Misc/Base64.h"
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
#include "RenderTimer.h"
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
	PracaMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_PracaDecal.M_PracaDecal"));
	PedraMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_PedraTalhada.M_PedraTalhada"));
	ObraMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Meshy/M_MeshyObra.M_MeshyObra"));
	MadeiraMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_MadeiraObra.M_MadeiraObra"));
	EstradaMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_EstradaDecal.M_EstradaDecal"));
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
	for (const TPair<FString, FAoEDef>& K : UnitDefs) if (K.Value.Skeletons.Num() > 0 || !K.Value.Movimento.IsEmpty()) Tipos.Add(K.Key);
	Tipos.Sort([&](const FString& A, const FString& B) { return UnitDefs[A].Familia + A < UnitDefs[B].Familia + B; });
	MyPlayer = 0; UuPerTile = 200; bHaveState = true; MyCentroidTiles = FVector2D(30.f, 30.f);
	VitrineZ = 30000.f;
	{
		// chao claro e plano sob a vitrine
		FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AStaticMeshActor* Fl = GetWorld()->SpawnActor<AStaticMeshActor>(FVector(30.f * 200.f, 34.f * 200.f, VitrineZ - 2.f), FRotator::ZeroRotator, Sp);
		Fl->GetStaticMeshComponent()->SetMobility(EComponentMobility::Movable);
		Fl->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")));
		Fl->SetActorScale3D(FVector(160.f, 160.f, 1.f));
		if (UMaterialInstanceDynamic* Dm = UMaterialInstanceDynamic::Create(BoxMaterial, Fl)) { Dm->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.35f, 0.38f, 0.3f)); Fl->GetStaticMeshComponent()->SetMaterial(0, Dm); }
	}
	const float Uu = (float)UuPerTile;
	int32 I = 0, Gi = 0;
	for (const FString& T : Tipos)
	{
		const FAoEDef* Def = &UnitDefs[T];
		const int32 Id = 900000 + I;
		FAoEVisual& V = Units.Add(Id);
		V.Type = T; V.Dono = 0; V.Familia = Def->Familia; V.Movimento = Def->Movimento;
		const bool bGigante = Def->Height >= 350.f;
		FVector2D Pos;
		if (bGigante) { Pos = FVector2D(14.f + Gi * 8.f, 52.f); ++Gi; }
		else { Pos = FVector2D(14.f + (I % 8) * 3.2f, 26.f + (I / 8) * 3.6f); }
		V.Actor = SpawnVisual(V, Def, Id, PlayerColor(0), 0.f, 60.f);
		V.Yaw = Def->Yaw;
		V.From = V.To = Pos;
		UE_LOG(LogTemp, Log, TEXT("AOE_VITRINE %s %.1f %.1f %.0f"), *T, Pos.X, Pos.Y, Def->Height);
		V.FromZ = V.ToZ = GroundZ(Pos.X * Uu, Pos.Y * Uu);
		V.Alpha = 1.f; V.Phase = I * 0.7f; V.AnimSeed = I * 37;
		// -AoEVitrineAndar: todas andando para +X (yaw do catalogo = andar para +X no jogo); quem olhar para outro lado tem o yaw errado
		const bool bAndar = FParse::Param(FCommandLine::Get(), TEXT("AoEVitrineAndar"));
		V.bMoving = bAndar || (I % 3) == 1; V.Speed = V.bMoving ? 210.f : 0.f;
		V.bAttacking = !bAndar && (I % 3) == 2; V.Serial = -1;
		if (V.Actor.IsValid()) ActorToUnit.Add(V.Actor.Get(), Id);
		if (!bGigante) ++I;
		else ++I;
	}
	{
		// fila de edificios: cada tipo do catalogo, uma copia por variante de malha (para avaliar os modelos lado a lado)
		TArray<FString> Bt; BuildingDefs.GetKeys(Bt); Bt.Sort();
		float Bx = 6.f; int32 Bn = 0;
		for (const FString& T : Bt)
		{
			const FAoEDef& Def = BuildingDefs[T];
			if (Def.bField) continue;
			const FIntPoint Sz = SizeOfBuilding(T);
			for (int32 v = 0; v < FMath::Max(1, Def.Meshes.Num()); ++v)
			{
				FAoEDef One = Def; if (Def.Meshes.Num() > 0) One.Meshes = { Def.Meshes[v] };
				const int32 Id = 960000 + Bn++;
				FAoEVisual& V = Buildings.Add(Id);
				V.bBuilding = true; V.Type = T; V.Dono = 0;
				V.Actor = SpawnVisual(V, &One, Id, PlayerColor(0), FMath::Min(Sz.X, Sz.Y) * 200.f, FMath::Min(Sz.X, Sz.Y) * 100.f);
				V.From = V.To = FVector2D(Bx + Sz.X * 0.5f, 6.f + (Bn % 2) * 7.f);
				V.FromZ = V.ToZ = VitrineZ; V.Alpha = 1.f; V.Yaw = Def.Yaw; V.Progress = 1.f; V.Hp01 = 1.f;
				if (Bn % 2 == 0) Bx += FMath::Max(Sz.X, 2) + 1.5f;
				UE_LOG(LogTemp, Log, TEXT("AoE: vitrine edificio %s [%d] tile (%.1f, %.1f)"), *T, v, V.To.X, V.To.Y);
			}
		}
	}
	if (const FAoEDef* Hd = BuildingDefs.Find(TEXT("house")))
		for (int32 k = 0; k < 3; ++k)
		{
			const int32 Id = 950000 + k;
			FAoEVisual& V = Buildings.Add(Id);
			V.bBuilding = true; V.Type = TEXT("house"); V.Dono = 0;
			V.Actor = SpawnVisual(V, Hd, Id, PlayerColor(0), 400.f, 200.f);
			V.From = V.To = FVector2D(26.f + k * 4.f, 20.f);
			V.FromZ = V.ToZ = VitrineZ; V.Alpha = 1.f; V.Yaw = Hd->Yaw;
			V.Progress = k == 0 ? 0.55f : 1.f; V.Hp01 = k == 2 ? 0.25f : 1.f;
		}
	if (const FAoEDef* Td = BuildingDefs.Find(TEXT("temple")))
	{
		// templo em obra na vitrine: andaime, blocos e a praca (referencia do canteiro do Rise of Kingdoms)
		const int32 Id = 951000;
		FAoEVisual& V = Buildings.Add(Id);
		V.bBuilding = true; V.Type = TEXT("temple"); V.Dono = 0;
		const FIntPoint Sz = SizeOfBuilding(V.Type);
		V.Actor = SpawnVisual(V, Td, Id, PlayerColor(0), FMath::Min(Sz.X, Sz.Y) * 200.f, FMath::Min(Sz.X, Sz.Y) * 100.f);
		V.From = V.To = FVector2D(44.f, 20.f); V.FromZ = V.ToZ = VitrineZ; V.Alpha = 1.f; V.Yaw = Td->Yaw;
		V.Progress = 0.45f; V.Hp01 = 1.f;
		V.Obra = SpawnObra(V, Id); V.Plaza = SpawnPlaza(V, Id);
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
		Ler(TEXT("gather_tree"), S.GatherTree); Ler(TEXT("build"), S.Build); Ler(TEXT("gather_farm"), S.GatherFarm); Ler(TEXT("gather_mine"), S.GatherMine);
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
			E->TryGetStringField(TEXT("movimento"), D.Movimento);
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
	// apelidos (Dados/apelidos.json, u2_apelidos.ts): tipo sem visual proprio usa o de outro (segue a cadeia ate achar um)
	int32 Apelidados = 0;
	FString ApTxt; TSharedPtr<FJsonObject> Ap;
	if (FFileHelper::LoadFileToString(ApTxt, *FPaths::Combine(FPaths::ProjectDir(), TEXT("Dados"), TEXT("apelidos.json")))
		&& FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(ApTxt), Ap) && Ap.IsValid())
	{
		auto Apelidar = [&](const TCHAR* Campo, TMap<FString, FAoEDef>& Defs)
		{
			const TSharedPtr<FJsonObject>* Mapa = nullptr;
			if (!Ap->TryGetObjectField(Campo, Mapa)) return;
			for (const auto& KV : (*Mapa)->Values)
			{
				const FString Tipo(KV.Key);
				if (Defs.Contains(Tipo)) continue;
				FString T = KV.Value->AsString();
				for (int32 i = 0; i < 6 && !Defs.Contains(T); ++i) { FString Prox; if (!(*Mapa)->TryGetStringField(T, Prox)) break; T = Prox; }
				if (const FAoEDef* Base = Defs.Find(T)) { const FAoEDef Copia = *Base; Defs.Add(Tipo, Copia); ++Apelidados; }
			}
		};
		Apelidar(TEXT("construcoes"), BuildingDefs);
		Apelidar(TEXT("unidades"), UnitDefs);
	}
	UE_LOG(LogTemp, Log, TEXT("AoE: catalogo visual: %d construcoes, %d unidades, %d nos (%d por apelido)"), BuildingDefs.Num(), UnitDefs.Num(), NodeDefs.Num(), Apelidados);
}

UStaticMesh* AAoEBridgeActor::LoadMesh(const FString& ShortPath)
{
	if (TObjectPtr<UStaticMesh>* Hit = MeshCache.Find(ShortPath)) return Hit->Get();
	if (ShortPath.StartsWith(TEXT("/Game/")))
	{
		// caminho completo de pacote (ex.: /Game/Vegetacao/island_tree_02/island_tree_02/StaticMeshes/island_tree_02)
		UStaticMesh* Full = LoadObject<UStaticMesh>(nullptr, *(ShortPath + TEXT(".") + FPackageName::GetShortName(ShortPath)));
		if (!Full) UE_LOG(LogTemp, Warning, TEXT("AoE: malha nao encontrada: %s"), *ShortPath);
		MeshCache.Add(ShortPath, Full);
		return Full;
	}
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
		FireISM = MakeIsm(Sphere, LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_Fogo.M_Fogo")), false, 1);
		GlowISM = MakeIsm(CylMesh, LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_Raio.M_Raio")), false, 4);
		if (UMaterialInterface* HaloMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Time/M_Halo.M_Halo"))) HaloISM = MakeIsm(PlaneMesh, HaloMat, false, 4);
		FlashLight = NewObject<UPointLightComponent>(this);
		FlashLight->SetMobility(EComponentMobility::Movable);
		FlashLight->SetIntensity(0.f);
		FlashLight->SetAttenuationRadius(4000.f);
		FlashLight->SetLightColor(FLinearColor(0.75f, 0.85f, 1.f));
		FlashLight->SetCastShadows(false);
		FlashLight->SetupAttachment(GetRootComponent());
		FlashLight->RegisterComponent();
	}
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEVitrine"))) { SpawnVitrine(); return; }
	Connect();
}

void AAoEBridgeActor::EndPlay(const EEndPlayReason::Type Reason)
{
	if (JsonPipe.IsValid()) { while (JsonPipe->HasWork()) FPlatformProcess::Sleep(0.001f); }
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
	if (!JsonPipe.IsValid()) { JsonPipe = MakeShared<UE::Tasks::FPipe>(TEXT("AoEJson")); JsonMsMax = MakeShared<std::atomic<double>>(0.0); }
	// copia a mensagem para a tarefa; o resultado entra na fila e e despachado no Tick (thread do jogo)
	TSharedPtr<std::atomic<double>> Ms = JsonMsMax;
	TQueue<TSharedPtr<FJsonObject>, EQueueMode::Spsc>* Fila = &Parsed;
	JsonPipe->Launch(TEXT("AoEJsonParse"), [Msg, Ms, Fila]()
	{
		const double T0 = FPlatformTime::Seconds();
		TSharedPtr<FJsonObject> Obj;
		if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Msg), Obj) || !Obj.IsValid()) return;
		const double D = (FPlatformTime::Seconds() - T0) * 1000.0;
		double Cur = Ms->load(); while (D > Cur && !Ms->compare_exchange_weak(Cur, D)) {}
		Fila->Enqueue(Obj);
	});
}

void AAoEBridgeActor::Dispatch(const TSharedPtr<FJsonObject>& O)
{
	const double T1 = FPlatformTime::Seconds();
	FString Type;
	if (!O->TryGetStringField(TEXT("type"), Type)) return;
	if (Type == TEXT("hello")) HandleHello(O);
	else if (Type == TEXT("state")) { HandleState(O); PerfState = FMath::Max(PerfState, (FPlatformTime::Seconds() - T1) * 1000.0); }
	else if (Type == TEXT("relevo"))
	{
		const TSharedPtr<FJsonObject>* Cab = nullptr; FString Campo, Dados; bool bFim = false;
		if (O->TryGetObjectField(TEXT("cab"), Cab)) RelevoCab = *Cab;
		else if (O->TryGetStringField(TEXT("campo"), Campo) && O->TryGetStringField(TEXT("d"), Dados)) RelevoAcum.FindOrAdd(Campo) += Dados;
		else if (O->TryGetBoolField(TEXT("fim"), bFim) && bFim) MontarTerreno();
	}
	else if (Type == TEXT("plantas")) ReceberPlantas(O);
	else if (Type == TEXT("over")) UE_LOG(LogTemp, Log, TEXT("AoE: fim de partida"));
}

void AAoEBridgeActor::HandleHello(const TSharedPtr<FJsonObject>& O)
{
	// uma nova partida: apaga tudo o que havia
	for (auto& P : Units) if (P.Value.Actor.IsValid()) P.Value.Actor->Destroy();
	for (auto& P : Buildings) { if (P.Value.Actor.IsValid()) P.Value.Actor->Destroy(); if (P.Value.Plaza.IsValid()) P.Value.Plaza->Destroy(); if (P.Value.Obra.IsValid()) P.Value.Obra->Destroy(); }
	for (auto& D : Dying) if (D.Actor.IsValid()) D.Actor->Destroy();
	for (auto& P : NodeComps) if (P.Value) P.Value->ClearInstances();
	Units.Empty(); Buildings.Empty(); Dying.Empty(); ActorToUnit.Empty(); Selected.Empty(); NodeRefs.Empty();
	MyPlayer = (int32)O->GetNumberField(TEXT("player"));
	{
		const TSharedPtr<FJsonObject>* M = nullptr;
		MapTerrain.Empty(); MapW = MapH = 0;
		if (O->TryGetObjectField(TEXT("map"), M))
		{
			MapW = (int32)(*M)->GetNumberField(TEXT("w")); MapH = (int32)(*M)->GetNumberField(TEXT("h"));
			FString T64;
			if ((*M)->TryGetStringField(TEXT("terrain"), T64)) FBase64::Decode(T64, MapTerrain);
			if (MapTerrain.Num() != MapW * MapH) { MapTerrain.Empty(); }
		}
		++MapSerial;
		{
			// U3: com relevo no hello o terreno e montado aqui; o Landscape do mapa (se houver) fica escondido e sem colisao
			RelevoAcum.Empty(); RelevoCab.Reset();   // novo hello: o relevo vem nas mensagens "relevo" seguintes
		}
		{
			// o relevo do Unreal foi exportado de um terreno (Dados/mapas.json, u2-exportar-terreno.ts); se a ponte mandar outro
			// (semente, tamanho ou numero de jogadores diferentes), edificios e unidades caem na agua ou no mato do mapa errado
			uint32 Hs = 0x811c9dc5u;
			for (const uint8 B : MapTerrain) { Hs ^= B; Hs *= 0x01000193u; }
			const FString Mapa = GetWorld()->GetOutermost()->GetName().Replace(TEXT("UEDPIE_0_"), TEXT(""));
			FString Txt; TSharedPtr<FJsonObject> J;
			const FString Arq = FPaths::Combine(FPaths::ProjectDir(), TEXT("Dados/mapas.json"));
			if (FFileHelper::LoadFileToString(Txt, *Arq) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Txt), J) && J.IsValid())
			{
				const TSharedPtr<FJsonObject>* E = nullptr;
				if (J->TryGetObjectField(Mapa, E))
				{
					const FString Esperado = (*E)->GetStringField(TEXT("hash"));
					const FString Veio = FString::Printf(TEXT("%08x"), Hs);
					if (Esperado != Veio)
					{
						const FString Msg = FString::Printf(TEXT("AoE: TERRENO DIFERENTE: o mapa %s foi exportado de semente %d, %s, %d jogadores (hash %s); a ponte mandou %dx%d (hash %s)"),
							*Mapa, (int32)(*E)->GetNumberField(TEXT("semente")), *(*E)->GetStringField(TEXT("tamanho")), (int32)(*E)->GetNumberField(TEXT("jogadores")), *Esperado, MapW, MapH, *Veio);
						UE_LOG(LogTemp, Warning, TEXT("%s"), *Msg);
						if (GEngine) GEngine->AddOnScreenDebugMessage(-1, 30.f, FColor::Orange, Msg);
					}
					else UE_LOG(LogTemp, Log, TEXT("AoE: terreno da ponte confere com %s (hash %s)"), *Mapa, *Veio);
				}
			}
		}
	}
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
	PowerNames.Empty();
	const TSharedPtr<FJsonObject>* HudGods = nullptr;
	if (O->TryGetObjectField(TEXT("gods"), HudGods)) for (const TPair<FString, TSharedPtr<FJsonValue>>& KV : (*HudGods)->Values)
	{
		const TSharedPtr<FJsonObject>* D = nullptr;
		FString Pw;
		if (KV.Value->TryGetObject(D) && (*D)->TryGetStringField(TEXT("power"), Pw)) PowerNames.Add(Pw, (*D)->GetStringField(TEXT("name")));
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
	if (Terreno && Terreno->Pronto()) return Terreno->AlturaEm(X, Y);
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
		if (Def->Familia == TEXT("civil") || Def->Familia == TEXT("soldado") || Def->Familia == TEXT("arqueiro") || Def->Familia == TEXT("cavalo"))
		{
			// cor do dono no pano vermelho do modelo (M_Meshy: CorTime/TingeTime); criaturas e edificios ficam com a cor propria
			for (int32 i = 0; i < K->GetNumMaterials(); ++i)
				if (UMaterialInstanceDynamic* Mt = K->CreateDynamicMaterialInstance(i))
				{
					Mt->SetVectorParameterValue(TEXT("CorTime"), Color);
					Mt->SetScalarParameterValue(TEXT("TingeTime"), 1.f);
				}
		}
		K->SetReceivesDecals(false);
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
		// decal projetado no chao (M_CampoDecal): segue o terreno em qualquer LOD; sem ele cai no plano antigo
		if (UMaterialInterface* CampoD = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Meshy/M_CampoDecal.M_CampoDecal")))
		{
			ADecalActor* DA = GetWorld()->SpawnActor<ADecalActor>(FVector::ZeroVector, FRotator::ZeroRotator, Sp);
			UDecalComponent* DC = DA->GetDecal();
			DC->SetMobility(EComponentMobility::Movable);
			DC->SetDecalMaterial(CampoD);
			// tamanho do decal = meia-extensao; X e a profundidade da projecao (para baixo, por causa do pitch -90 do ator)
			const float Half = FootprintCm * Def->Fit * 0.5f;
			DC->DecalSize = FVector(300.f, Half, Half);
			DC->MarkRenderStateDirty();   // o proxy do decal guarda o tamanho no registro: sem isto fica no padrao (5 m)
			DC->SetFadeScreenSize(0.f);
			DC->SetRelativeRotation(FRotator(-90.f, 0.f, 0.f));
			V.BaseScale = 1.f;
			V.MeshHeight = 30.f;
			V.Lift = 0.f;
			return DA;
		}
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
	C->SetReceivesDecals(false);
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
		Powers.Empty();
		const TArray<TSharedPtr<FJsonValue>>* Pw = nullptr;
		if ((*MeObj)->TryGetArrayField(TEXT("powers"), Pw))
			for (const TSharedPtr<FJsonValue>& V : *Pw)
			{
				const TSharedPtr<FJsonObject>* PO = nullptr;
				if (!V->TryGetObject(PO)) continue;
				FAoEPower P; P.Id = (*PO)->GetStringField(TEXT("id")); (*PO)->TryGetBoolField(TEXT("used"), P.bUsed);
				double Ch = 0; (*PO)->TryGetNumberField(TEXT("charges"), Ch); P.Charges = (int32)Ch;
				Powers.Add(P);
			}
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
				Vis->Movimento = Def ? Def->Movimento : FString();
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
			else if (St == TEXT("build")) Vis->GatherKind = 4;   // cidadao na obra: martela
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
				if (!(Def && Def->bField) && Vis->Type != TEXT("wall") && Vis->Type != TEXT("gate")) Vis->Plaza = SpawnPlaza(*Vis, Id);
				UE_LOG(LogTemp, Log, TEXT("AoE: edificio %s id %d dono %d tile (%.1f, %.1f) z %.0f escala %.2f altura %.0f"), *Vis->Type, Id, Dono, Center.X, Center.Y, Vis->ToZ, Vis->BaseScale, Vis->MeshHeight);
			}
			Vis->Progress = Prog;
			// andaime: nao em lavoura nem em trecho de muralha/portao (uma fileira de andaimes vira um zigue-zague)
			if (Prog < 1.f && !Vis->Obra.IsValid() && !(BuildingDefs.Find(Vis->Type) && BuildingDefs.Find(Vis->Type)->bField) && Vis->Type != TEXT("wall") && Vis->Type != TEXT("gate")) Vis->Obra = SpawnObra(*Vis, Id);
			if (Prog >= 1.f && Vis->Obra.IsValid())
			{
				Vis->Obra->Destroy(); Vis->Obra = nullptr;
				AddPuffs(FVector(Vis->To.X * Uu, Vis->To.Y * Uu, Vis->ToZ), 6, 80.f, 260.f, 2.5f, 0.f, 200.f);   // obra entregue: a poeira assenta
			}
			{ double Q = 0; B->TryGetNumberField(TEXT("q"), Q); Vis->Queue = (int32)Q; }
			double Hp = 1, Mhp = 1;
			B->TryGetNumberField(TEXT("hp"), Hp); B->TryGetNumberField(TEXT("mhp"), Mhp);
			Vis->Hp01 = Mhp > 0 ? (float)(Hp / Mhp) : 1.f;
			Vis->Serial = StateSerial;
		}
		for (auto It = Buildings.CreateIterator(); It; ++It)
			if (It->Value.Serial != StateSerial)
			{
				if (It->Value.Actor.IsValid()) It->Value.Actor->Destroy();
				if (It->Value.Plaza.IsValid()) It->Value.Plaza->Destroy();
				if (It->Value.Obra.IsValid()) It->Value.Obra->Destroy();
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
		const TArray<UAnimSequence*>& G = V.GatherKind == 1 ? FS->GatherTree : (V.GatherKind == 2 ? FS->GatherFarm : (V.GatherKind == 4 ? FS->Build : FS->GatherMine));
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
		else if (Want >= 4) L = Want == 4 ? &FS->GatherTree : (Want == 5 ? &FS->GatherFarm : (Want == 7 ? &FS->Build : &FS->GatherMine));
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
		if (ObraMat && V.Body.IsValid() && V.Progress < 1.f)
		{
			// obra: o edificio fica no lugar e aparece de baixo para cima (base e colunas primeiro), dentro do andaime
			Z += V.Lift;
			if (V.CorteMids.Num() == 0) SetObraMats(V, true);
			const float Corte = Z - V.Lift + 4.f + FMath::Clamp(V.Progress, 0.f, 1.f) * V.MeshHeight * 1.02f;
			for (TWeakObjectPtr<UMaterialInstanceDynamic>& M : V.CorteMids) if (M.IsValid()) M->SetScalarParameterValue(TEXT("CorteZ"), Corte);
		}
		else
		{
			if (V.CorteMids.Num() > 0) SetObraMats(V, false);
			Z += V.Lift - (ObraMat ? 0.f : (1.f - V.Progress) * V.MeshHeight * 0.97f);
		}
		if (V.Obra.IsValid() && V.GuinCarga.IsValid() && V.GuinCorda.IsValid())
		{
			// o bloco sobe devagar do chao ate perto do topo da obra e desce de novo (~14 s por ciclo)
			const float Sobe = 0.5f - 0.5f * FMath::Cos(Clock * 0.45f + V.GuinFase);
			const float Zb = 30.f + Sobe * V.GuinAlt * 0.8f;
			const FVector T = V.GuinTopo;
			const float Pend = 3.f * FMath::Sin(Clock * 1.3f + V.GuinFase);   // balanco leve
			V.GuinCarga->UpdateInstanceTransform(0, FTransform(FRotator(0.f, Pend * 4.f, 0.f), FVector(T.X, Pend, Zb), FVector(0.6f, 0.5f, 0.42f)), false, true, true);
			const float Len = FMath::Max(10.f, T.Z - (Zb + 21.f));
			V.GuinCorda->UpdateInstanceTransform(0, FTransform(FRotator::ZeroRotator, FVector(T.X, Pend * 0.5f, Zb + 21.f + Len * 0.5f), FVector(0.025f, 0.025f, Len / 100.f)), false, true, true);
		}
	}
	else
	{
		Z += V.Lift;
		if (V.Skel.IsValid()) { DriveSkeletal(V, 0); }
		else if (!V.Movimento.IsEmpty())
		{
			// criaturas e maquinas sem esqueleto: movimento procedural por tipo (a fase avanca mais rapido andando)
			const float Sd = Hash01(V.AnimSeed, 41) * 6.28f;
			V.Phase += Dt * (V.bMoving ? 1.f : 0.45f);
			const float Ph = V.Phase + Sd;
			if (V.Movimento == TEXT("voo"))
			{
				// paira 2,5-3,5 m acima do chao, sobe e desce, inclina para a frente andando e balanca de lado
				Z += 300.f + 45.f * FMath::Sin(Ph * 2.2f);
				Rot.Pitch = (V.bMoving ? -10.f : 0.f) + 4.f * FMath::Sin(Ph * 2.2f + 1.2f);
				Rot.Roll = 7.f * FMath::Sin(Ph * 1.3f);
			}
			else if (V.Movimento == TEXT("serpente"))
			{
				// corpo de serpente: ondula de lado e respira
				Rot.Yaw += 7.f * FMath::Sin(Ph * 2.6f);
				Rot.Roll = 3.f * FMath::Sin(Ph * 2.6f + 1.f);
				Z += 6.f * FMath::Abs(FMath::Sin(Ph * 2.6f));
			}
			else if (V.Movimento == TEXT("gigante"))
			{
				// passada pesada e lenta; poeira a cada pisada quando anda
				const float Pa = Ph * 3.2f;
				Z += (V.bMoving ? 22.f : 4.f) * FMath::Abs(FMath::Sin(Pa));
				Rot.Roll = (V.bMoving ? 3.f : 0.8f) * FMath::Sin(Pa);
				if (V.bMoving && FMath::Sin(Pa) * FMath::Sin(Pa - Dt * 3.2f) <= 0.f && PuffISM)
					AddPuffs(FVector(P.X * UuPerTile, P.Y * UuPerTile, Z - 20.f), 2, 70.f, 220.f, 1.8f, 0.f, 120.f);
			}
			else if (V.Movimento == TEXT("maquina"))
			{
				// madeira e rodas: so treme um pouco andando
				if (V.bMoving) { Rot.Pitch = 1.2f * FMath::Sin(Ph * 17.f); Z += 2.f * FMath::Abs(FMath::Sin(Ph * 9.f)); }
			}
			else if (V.Movimento == TEXT("barco"))
			{
				// sobre a agua: balanco e arfagem lentos sempre, um pouco mais andando
				Rot.Roll = 3.5f * FMath::Sin(Ph * 1.1f);
				Rot.Pitch = 2.f * FMath::Sin(Ph * 0.8f + 0.7f) + (V.bMoving ? -1.5f : 0.f);
				Z += 12.f * FMath::Sin(Ph * 1.4f);
			}
		}
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
		FAoEProj Pv; Pv.A = FVector(14.f * 200.f, 22.f * 200.f, VitrineZ + 150.f); Pv.B = FVector((16.f + FMath::FRand() * 20.f) * 200.f, 30.f * 200.f, VitrineZ + 90.f);
		Pv.Dur = 1.0f; Pv.Apex = 500.f; Pv.bStone = FMath::FRand() < 0.3f; Projs.Add(Pv);
		if (FMath::Fmod(Clock, 1.5f) < Dt) { AddBolt(FVector(36.f * 200.f, 20.f * 200.f, VitrineZ)); FAoEGlow Gw; Gw.P = FVector(42.f * 200.f, 20.f * 200.f, VitrineZ); Gw.Dur = 1.6f; Gw.Size = FVector(12.f, 12.f, 0.06f); Gw.Cor = FLinearColor(1.f, 0.78f, 0.35f) * 0.06f; /* halo dourado leve no chao */ Glows.Add(Gw); FAoEGlow Col = Gw; Col.Size = FVector(0.35f, 0.35f, 12.f); Col.P.Z += 600.f; Col.Cor = FLinearColor(1.f, 0.82f, 0.45f) * 0.35f; Glows.Add(Col); }
		if (FMath::Fmod(Clock, 4.f) < Dt) { AddPuffs(FVector(30.f * 200.f, 30.f * 200.f, VitrineZ), 26, 90.f, 260.f, 3.8f, 0.15f, 300.f); AddPuffs(FVector(27.f * 200.f, 29.f * 200.f, VitrineZ), 2, 35.f, 110.f, 1.4f, 0.f, 40.f); }
	}
	// -AoEVitrinePoderes: uma fileira com cada efeito de poder, disparados juntos a cada 3 s (para conferir cor e forma)
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEVitrinePoderes")) && FMath::Fmod(Clock, 3.f) < Dt)
	{
		static const TCHAR* Nomes[] = { TEXT("heal"), TEXT("pestilence"), TEXT("curse"), TEXT("spawn"), TEXT("evolve"), TEXT("titanRise"), TEXT("ability"), TEXT("panic"), TEXT("retribution"), TEXT("crossroads"), TEXT("gale"), TEXT("tidal_wave"), TEXT("divine_harvest"), TEXT("sun_chariot"), TEXT("winged_victory"), TEXT("phoenix") };
		for (int32 i = 0; i < UE_ARRAY_COUNT(Nomes); ++i)
			PowerFx(TEXT("divine"), Nomes[i], FVector((8.f + (i % 6) * 8.f) * UuPerTile, (58.f + (i / 6) * 6.f) * UuPerTile, VitrineZ), 3.f, 0);
	}
	Clock += Dt;
	PerfAcc += Dt; ++PerfFrames; PerfWorst = FMath::Max(PerfWorst, (double)Dt); PerfFrames95.Add(Dt * 1000.f);
	if (PerfAcc >= 5.0)
	{
		const double Fps = PerfFrames / PerfAcc;
		const double Gpu = FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles(0));
		const FPlatformMemoryStats Mem = FPlatformMemory::GetStats();
		PerfFrames95.Sort();
		const float P95 = PerfFrames95.Num() ? PerfFrames95[FMath::Min(PerfFrames95.Num() - 1, (int32)(PerfFrames95.Num() * 0.95f))] : 0.f;
		PerfFrames95.Reset();
		const double J = PerfJson, Es = PerfState, Fx = PerfFx, Un = PerfUnits, Bd = PerfBld; PerfJson = PerfState = PerfFx = PerfUnits = PerfBld = 0.0;
		const FString Linha = FString::Printf(TEXT("AOE_PERF t=%.0f fps=%.1f p95_ms=%.2f quadro_ms=%.2f pior_ms=%.1f gpu_ms=%.2f jogo_ms=%.2f render_ms=%.2f json_ms=%.1f estado_ms=%.1f fx_ms=%.1f unid_ms=%.1f edif_ms=%.1f ram_mb=%.0f unidades=%d edificios=%d projeteis=%d poeira=%d"),
			(double)Clock, Fps, (double)P95, 1000.0 / FMath::Max(Fps, 0.001), PerfWorst * 1000.0, Gpu, FPlatformTime::ToMilliseconds(GGameThreadTime), FPlatformTime::ToMilliseconds(GRenderThreadTime), J, Es, Fx, Un, Bd, (double)Mem.UsedPhysical / (1024.0 * 1024.0), Units.Num(), Buildings.Num(), Projs.Num(), Puffs.Num());
		UE_LOG(LogTemp, Log, TEXT("%s"), *Linha);
		if (PerfFile.IsEmpty()) FParse::Value(FCommandLine::Get(), TEXT("AoEPerfLog="), PerfFile);
		if (!PerfFile.IsEmpty()) FFileHelper::SaveStringToFile(Linha + LINE_TERMINATOR, *PerfFile, FFileHelper::EEncodingOptions::AutoDetect, &IFileManager::Get(), FILEWRITE_Append);
		PerfSumFps += Fps; PerfSumGpu += Gpu; ++PerfWindows;
		PerfAcc = 0.0; PerfFrames = 0; PerfWorst = 0.0;
	}
	{
		TSharedPtr<FJsonObject> Obj;
		while (Parsed.Dequeue(Obj)) Dispatch(Obj);
		if (JsonMsMax.IsValid()) PerfJson = FMath::Max(PerfJson, JsonMsMax->exchange(0.0));
	}
	double Tf = FPlatformTime::Seconds();
	TickEffects(Dt);
	PerfFx = FMath::Max(PerfFx, (FPlatformTime::Seconds() - Tf) * 1000.0);
	if (BirdsSerial != MapSerial && MapW > 0) SpawnBirds();
	TickBirds(Dt);
	if (Clock - EstradaT >= 2.0) { EstradaT = Clock; AtualizaEstradas(); }
	LimpaPlantas();
	Tf = FPlatformTime::Seconds();
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
	PerfUnits = FMath::Max(PerfUnits, (FPlatformTime::Seconds() - Tf) * 1000.0);
	Tf = FPlatformTime::Seconds();
	if (FireISM) FireISM->ClearInstances();
	for (auto& P : Buildings)
	{
		UpdateVisual(P.Value, Dt);
		AmbientFx(P.Key, P.Value, Dt);
		if (UStaticMeshComponent* D = P.Value.Disc.Get())
		{
			// bandeira do dono no canto sudeste do edificio: mastro so um pouco acima do telhado (2,6-5,2 m; os de 4,4 m em toda
			// casa viravam um paliteiro de longe) e pano de 0,85 m x 0,55 m perto do topo
			const FIntPoint* Sz = BuildingSize.Find(P.Value.Type);
			const float Fp = (Sz ? FMath::Min(Sz->X, Sz->Y) : 2) * (float)UuPerTile;
			AActor* A = P.Value.Actor.Get();
			if (A)
			{
				// mastro no canto, um pouco para fora da pegada (em torre/edificio alto o pano nao entra na parede)
				const FVector Base(P.Value.To.X * UuPerTile + Fp * 0.5f + 35.f, P.Value.To.Y * UuPerTile + Fp * 0.5f + 35.f, GroundZ(P.Value.To.X * UuPerTile + Fp * 0.5f + 35.f, P.Value.To.Y * UuPerTile + Fp * 0.5f + 35.f));
				const float Sway = FMath::Sin(Clock * 2.2f + P.Key) * 4.f;
				const float Hm = FMath::Clamp(P.Value.MeshHeight + 60.f, 260.f, 520.f);
				if (UStaticMeshComponent* Po = P.Value.Pole.Get()) { Po->SetWorldScale3D(FVector(0.06f, 0.06f, Hm / 100.f)); Po->SetWorldLocation(Base + FVector(0, 0, Hm * 0.5f)); Po->SetWorldRotation(FRotator::ZeroRotator); }
				if (EstandarteMat)
				{
					// plano em pe (Roll 90): X = comprimento do pano a partir do mastro, Y = altura; o vento esta no material
					D->SetWorldScale3D(FVector(0.85f, 0.55f, 1.f));
					D->SetWorldRotation(FRotator(0.f, 35.f, 90.f));
					D->SetWorldLocation(Base + FRotator(0.f, 35.f, 0.f).RotateVector(FVector(45.f, 0.f, 0.f)) + FVector(0, 0, Hm - 40.f));
				}
				else
				{
					D->SetWorldScale3D(FVector(0.03f, 1.3f, 0.8f));
					D->SetWorldLocation(Base + FVector(Sway, -70.f, Hm - 40.f));
					D->SetWorldRotation(FRotator(0.f, Sway * 0.6f, 0.f));
				}
			}
			if (UMaterialInstanceDynamic* M = P.Value.DiscMat.Get()) M->SetVectorParameterValue(TEXT("Color"), PlayerColor(P.Value.Dono) * (EstandarteMat ? 0.5f : 1.6f));
		}
	}
	if (FireISM) FireISM->MarkRenderStateDirty();
	PerfBld = FMath::Max(PerfBld, (FPlatformTime::Seconds() - Tf) * 1000.0);
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
		else if (T == TEXT("bolt")) AddBolt(FVector(X, Y, GroundZ(X, Y)));
		else if (T == TEXT("quake"))
		{
			double R = 7; E->TryGetNumberField(TEXT("data"), R);
			const FVector G(X, Y, GroundZ(X, Y));
			for (int32 i = 0; i < 18; ++i) { const float A = i / 18.f * 2.f * PI; AddPuffs(G + FVector(FMath::Cos(A), FMath::Sin(A), 0.f) * R * Uu * 0.6f, 1, 120.f, 380.f, 4.5f, 0.1f, 120.f); }
		}
		else
		{
			// poderes, cura, peste, maldicao, invocacao, evolucao, bronze, petrificacao, Tita, habilidade de heroi
			double R = 3; E->TryGetNumberField(TEXT("data"), R);
			FString Fonte; E->TryGetStringField(TEXT("src"), Fonte);
			double Dono = -1; E->TryGetNumberField(TEXT("owner"), Dono);
			PowerFx(T, Fonte, FVector(X, Y, GroundZ(X, Y)), (float)R, (int32)Dono);
		}
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
	// brilhos de poder: aparecem forte e somem; o clarao do raio ilumina a cena por um instante
	if (GlowISM)
	{
		GlowISM->ClearInstances();
		if (HaloISM) HaloISM->ClearInstances();
		for (int32 i = Glows.Num() - 1; i >= 0; --i)
		{
			FAoEGlow& G = Glows[i];
			G.T += Dt;
			if (G.T >= G.Dur) { Glows.RemoveAtSwap(i); continue; }
			const float K = G.T / G.Dur;
			const float I = FMath::Clamp((1.f - K) * (K < 0.08f ? K / 0.08f : 1.f), 0.f, 1.f) * (0.75f + 0.25f * FMath::Sin(G.T * 60.f));
			G.P += G.V * Dt;
			UInstancedStaticMeshComponent* Alvo = (G.bHalo && HaloISM) ? HaloISM.Get() : GlowISM.Get();
			const int32 N = Alvo->AddInstance(FTransform(G.R, G.P, G.Size * (1.f + G.Cresce * K)));
			Alvo->SetCustomDataValue(N, 0, G.Cor.R, false); Alvo->SetCustomDataValue(N, 1, G.Cor.G, false);
			Alvo->SetCustomDataValue(N, 2, G.Cor.B, false); Alvo->SetCustomDataValue(N, 3, I, false);
		}
		GlowISM->MarkRenderStateDirty();
		if (HaloISM) HaloISM->MarkRenderStateDirty();
	}
	if (FlashLight) { FlashT += Dt; FlashLight->SetIntensity(FlashT < 0.35f ? 600000.f * (1.f - FlashT / 0.35f) * (0.6f + 0.4f * FMath::Sin(FlashT * 90.f)) : 0.f); }
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
		Data.Add(FMath::Clamp(F.Dark, -1.f, 1.f));   // < 0 = espuma/borrifo claro (M_Poeira)
	}
	if (Pt.Num())
	{
		PuffISM->AddInstances(Pt, false, true);
		for (int32 i = 0; i < Pt.Num(); ++i) { PuffISM->SetCustomDataValue(i, 0, Data[i * 2], false); PuffISM->SetCustomDataValue(i, 1, Data[i * 2 + 1], i == Pt.Num() - 1); }
	}
}

void AAoEBridgeActor::AmbientFx(int32 Id, FAoEVisual& V, float Dt)
{
	if (!PuffISM || !V.bBuilding || !V.Actor.IsValid()) return;
	V.FxT += Dt;
	const FVector Base(V.To.X * UuPerTile, V.To.Y * UuPerTile, V.ToZ);
	const float Top = V.MeshHeight * 0.85f;
	const float Seed = Hash01(Id, 21);
	// obra: poeira baixa em volta da base
	if (V.Progress < 1.f)
	{
		if (V.FxT > 0.9f + Seed * 0.5f) { V.FxT = 0.f; AddPuffs(Base, 1, 60.f, 200.f, 2.2f, 0.f, 180.f); }
		return;
	}
	// dano: coluna de fumaca escura; abaixo de 40 % tambem fogo no telhado
	if (V.Hp01 < 0.6f)
	{
		if (V.FxT > 0.35f + Seed * 0.2f)
		{
			V.FxT = 0.f;
			FAoEPuff F; F.P = Base + FVector((Seed - 0.5f) * 120.f, (Hash01(Id, 22) - 0.5f) * 120.f, Top + 80.f);
			F.V = FVector(35.f, 18.f, 120.f + 60.f * FMath::FRand()); F.R0 = 50.f; F.R1 = 230.f; F.Dur = 4.5f; F.Dark = FMath::Lerp(0.55f, 1.f, 1.f - V.Hp01);
			if (Puffs.Num() < 400) Puffs.Add(F);
		}
		if (V.Hp01 < 0.4f && FireISM)
		{
			const float Fl = 0.8f + 0.2f * FMath::Sin(Clock * 13.f + Id) * FMath::Sin(Clock * 7.f + Id * 0.3f);
			for (int32 k = 0; k < 3; ++k)
			{
				const FVector P = Base + FVector((Hash01(Id, 30 + k) - 0.5f) * 220.f, (Hash01(Id, 40 + k) - 0.5f) * 220.f, Top + 30.f);
				const int32 I = FireISM->AddInstance(FTransform(FRotator::ZeroRotator, P, FVector(1.6f, 1.6f, 2.8f) * Fl));
				FireISM->SetCustomDataValue(I, 0, FMath::Lerp(0.5f, 1.f, 1.f - V.Hp01 / 0.4f), false);
			}
		}
		return;
	}
	// casa e Centro Civico prontos: um fio de fumaca clara de chamine, de vez em quando
	if ((V.Type == TEXT("house") || V.Type == TEXT("town_center")) && V.FxT > 1.6f + Seed * 1.4f)
	{
		V.FxT = 0.f;
		FAoEPuff F; F.P = Base + FVector((Seed - 0.5f) * 90.f, (Hash01(Id, 23) - 0.5f) * 90.f, Top + 40.f);
		F.V = FVector(25.f, 12.f, 70.f); F.R0 = 18.f; F.R1 = 90.f; F.Dur = 3.2f; F.Dark = 0.35f;
		if (Puffs.Num() < 400) Puffs.Add(F);
	}
}

void AAoEBridgeActor::SpawnBirds()
{
	BirdsSerial = MapSerial;
	for (FAoEBird& B : Birds) if (B.K.IsValid()) B.K->GetOwner()->Destroy();
	Birds.Empty();
	USkeletalMesh* Gull = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Anim/aves/seagull/seagull/SkeletalMeshes/seagull.seagull"));
	USkeletalMesh* Eagle = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Anim/aves/eagle/eagle/SkeletalMeshes/eagle.eagle"));
	if (!Gull || !Eagle || MapTerrain.Num() != MapW * MapH) return;
	const float Uu = (float)UuPerTile;
	auto Terra = [&](int32 x, int32 y) { if (x < 0 || y < 0 || x >= MapW || y >= MapH) return -1; return (int32)MapTerrain[y * MapW + x]; };
	auto Agua = [&](int32 t) { return t == 1 || t == 5 || t == 6; };
	// pontos de costa (agua com terra a ate 3 tiles) e de terra alta (montanha)
	TArray<FIntPoint> Costa, Alto;
	for (int32 y = 2; y < MapH - 2; y += 3) for (int32 x = 2; x < MapW - 2; x += 3)
	{
		const int32 T = Terra(x, y);
		if (Agua(T)) { bool bPerto = false; for (int32 d = -3; d <= 3 && !bPerto; ++d) bPerto = !Agua(Terra(x + d, y)) || !Agua(Terra(x, y + d)); if (bPerto) Costa.Add(FIntPoint(x, y)); }
		else if (T == 2) Alto.Add(FIntPoint(x, y));
	}
	FRandomStream R(MapW * 7919 + MapH);
	FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	auto Nova = [&](USkeletalMesh* M, const FIntPoint& P, bool bEagle)
	{
		ASkeletalMeshActor* A = GetWorld()->SpawnActor<ASkeletalMeshActor>(FVector::ZeroVector, FRotator::ZeroRotator, Sp);
		USkeletalMeshComponent* K = A->GetSkeletalMeshComponent();
		K->SetMobility(EComponentMobility::Movable);
		K->SetSkeletalMesh(M);
		K->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		K->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		K->SetCastShadow(true);
		const float Env = FMath::Max(1.f, M->GetBounds().BoxExtent.Y * 2.f);
		K->SetWorldScale3D(FVector((bEagle ? 190.f : 120.f) / Env));   // envergadura em cm
		FAoEBird B; B.K = K; B.bEagle = bEagle;
		B.C = FVector((P.X + 0.5f) * Uu, (P.Y + 0.5f) * Uu, 0.f);
		B.R = R.FRandRange(bEagle ? 1200.f : 500.f, bEagle ? 2400.f : 1300.f);
		B.Z = GroundZ(B.C.X, B.C.Y) + R.FRandRange(bEagle ? 1300.f : 380.f, bEagle ? 2100.f : 750.f);   // abaixo da câmera de jogo (~4.000 cm)
		B.W = (R.FRand() < 0.5f ? -1.f : 1.f) * R.FRandRange(0.18f, 0.32f) * (bEagle ? 0.6f : 1.f);
		B.A = R.FRand() * 2.f * PI; B.NextFlap = R.FRand() * 3.f;
		Birds.Add(B);
	};
	for (int32 i = 0; i < 9 && Costa.Num() > 0; ++i) Nova(Gull, Costa[R.RandRange(0, Costa.Num() - 1)], false);
	for (int32 i = 0; i < 3 && Alto.Num() > 0; ++i) Nova(Eagle, Alto[R.RandRange(0, Alto.Num() - 1)], true);
	UE_LOG(LogTemp, Log, TEXT("AoE: %d aves (costa %d pontos, alto %d)"), Birds.Num(), Costa.Num(), Alto.Num());
	for (const FAoEBird& Bd : Birds) UE_LOG(LogTemp, Log, TEXT("AoE: ave %s centro tile (%.1f, %.1f) raio %.0f altura %.0f"), Bd.bEagle ? TEXT("aguia") : TEXT("gaivota"), Bd.C.X / Uu, Bd.C.Y / Uu, Bd.R, Bd.Z);
}

void AAoEBridgeActor::TickBirds(float Dt)
{
	const FAnimSet* S = AnimSets.Find(TEXT("ave"));
	if (!S) return;
	UAnimSequence* Flap = FAnimSet::Pick(S->Run, 0);
	UAnimSequence* Glide = S->Attack.Num() > 1 ? S->Attack[1] : nullptr;
	if (!Glide) { for (UAnimSequence* Q : S->Walk) if (Q && Q->GetName().Contains(TEXT("Glide"))) Glide = Q; }
	if (!Glide) Glide = LoadObject<UAnimSequence>(nullptr, TEXT("/Game/Anim/bird/bird-animations/SkeletalMeshes/bird-animationsGlide.bird-animationsGlide"));
	for (FAoEBird& B : Birds)
	{
		USkeletalMeshComponent* K = B.K.Get();
		if (!K) continue;
		B.A += B.W * Dt;
		const float Bob = FMath::Sin(B.A * 3.f) * 40.f;
		const FVector P = B.C + FVector(FMath::Cos(B.A) * B.R, FMath::Sin(B.A) * B.R, 0.f) + FVector(0, 0, B.Z + Bob);
		const FVector Tan(-FMath::Sin(B.A) * FMath::Sign(B.W), FMath::Cos(B.A) * FMath::Sign(B.W), 0.f);
		const float Bank = FMath::Sign(B.W) * (B.bEagle ? 18.f : 25.f);
		K->GetOwner()->SetActorLocationAndRotation(P, FRotator(0.f, FMath::RadiansToDegrees(FMath::Atan2(Tan.Y, Tan.X)) - 90.f, -Bank));
		// bate asa um pouco e plana um tempo (a aguia plana mais)
		B.NextFlap -= Dt;
		if (B.NextFlap <= 0.f)
		{
			B.bFlap = !B.bFlap;
			UAnimSequence* Q = B.bFlap ? Flap : Glide;
			if (Q) { K->PlayAnimation(Q, true); K->SetPlayRate(B.bFlap ? 1.1f : 1.f); }
			B.NextFlap = B.bFlap ? FMath::FRandRange(1.2f, 2.5f) : FMath::FRandRange(B.bEagle ? 5.f : 2.5f, B.bEagle ? 10.f : 5.f);
		}
	}
}

void AAoEBridgeActor::AddBolt(const FVector& Ground)
{
	// raio: do alto ate o chao em 7 segmentos com desvio aleatorio, mais dois galhos; clarao de luz e poeira no impacto
	FVector A = Ground + FVector(FMath::FRandRange(-300.f, 300.f), FMath::FRandRange(-300.f, 300.f), 4500.f);
	const int32 Seg = 7;
	for (int32 i = 0; i < Seg; ++i)
	{
		const float K = (i + 1.f) / Seg;
		FVector B = FMath::Lerp(A, Ground, 1.f / (Seg - i));
		if (i < Seg - 1) B += FVector(FMath::FRandRange(-220.f, 220.f), FMath::FRandRange(-220.f, 220.f), 0.f) * (1.f - K);
		const FVector D = B - A;
		FAoEGlow G; G.P = (A + B) * 0.5f; G.R = FRotationMatrix::MakeFromZ(D.GetSafeNormal()).Rotator();
		G.Size = FVector(0.16f, 0.16f, D.Size() / 100.f); G.Cor = FLinearColor(0.7f, 0.82f, 1.f); G.Dur = 0.45f;
		Glows.Add(G);
		if (i == 2 || i == 4)
		{
			const FVector Br = B + FVector(FMath::FRandRange(-500.f, 500.f), FMath::FRandRange(-500.f, 500.f), -FMath::FRandRange(300.f, 700.f));
			FAoEGlow Gb = G; Gb.P = (B + Br) * 0.5f; Gb.R = FRotationMatrix::MakeFromZ((Br - B).GetSafeNormal()).Rotator();
			Gb.Size = FVector(0.08f, 0.08f, (Br - B).Size() / 100.f); Gb.Dur = 0.3f; Glows.Add(Gb);
		}
		A = B;
	}
	if (FlashLight) { FlashLight->SetWorldLocation(Ground + FVector(0, 0, 800.f)); FlashT = 0.f; }
	AddPuffs(Ground, 6, 60.f, 260.f, 2.5f, 0.6f, 120.f);
}

AActor* AAoEBridgeActor::SpawnPlaza(const FAoEVisual& V, int32 Id)
{
	if (!PracaMat) return nullptr;
	const FIntPoint S = SizeOfBuilding(V.Type);
	const float Uu = (float)UuPerTile;
	// praca um pouco maior que a pegada (o Centro Civico ganha um largo); meia-extensao em Y/Z, X = profundidade da projecao
	const float Margem = V.Type == TEXT("town_center") ? 2.2f : 1.0f;
	FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	// pitch -90 e yaw 90: Y do decal = X do mundo, Z do decal = Y do mundo (a textura e o ruido vem da posicao no mundo,
	// entao girar a caixa nao varia nada; so trocaria os lados de uma pegada retangular)
	ADecalActor* DA = GetWorld()->SpawnActor<ADecalActor>(FVector(V.To.X * Uu, V.To.Y * Uu, V.ToZ), FRotator(-90.f, 90.f, 0.f), Sp);
	UDecalComponent* DC = DA->GetDecal();
	DC->SetMobility(EComponentMobility::Movable);
	DC->SetDecalMaterial(PracaMat);
	const float Hx = (S.X * 0.5f + Margem) * Uu, Hy = (S.Y * 0.5f + Margem) * Uu;
	DC->DecalSize = FVector(400.f, Hx, Hy);
	DC->MarkRenderStateDirty();   // o proxy do decal guarda o tamanho no registro: sem isto fica no padrao (5 m)
	DC->SortOrder = -1;   // a lavoura (decal do campo) fica por cima se encostar
	DC->SetFadeScreenSize(0.f);
	// plantas sob a praca saem (a borda esmaecida, ~0,3 tile, pode manter capim)
	ZonasLimpar.Add({ FVector2D(V.To.X * Uu, V.To.Y * Uu), FVector2D(Hx - 0.3f * Uu, Hy - 0.3f * Uu), 0.f });
	return DA;
}

AActor* AAoEBridgeActor::SpawnObra(const FAoEVisual& V, int32 Id)
{
	// canteiro: postes de madeira nos cantos e no meio dos lados, dois pisos de tabuas, escoras, e uma pilha de blocos de pedra ao lado
	const FIntPoint S = SizeOfBuilding(V.Type);
	const float Uu = (float)UuPerTile;
	const float Hx = S.X * Uu * 0.5f + 20.f, Hy = S.Y * Uu * 0.5f + 20.f;
	const float Alt = FMath::Clamp(V.MeshHeight * 1.05f, 300.f, 1400.f);
	FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AActor* A = GetWorld()->SpawnActor<AActor>(AActor::StaticClass(), FVector(V.To.X * Uu, V.To.Y * Uu, V.ToZ), FRotator::ZeroRotator, Sp);
	USceneComponent* Root = NewObject<USceneComponent>(A); A->SetRootComponent(Root); Root->RegisterComponent();
	A->SetActorLocation(FVector(V.To.X * Uu, V.To.Y * Uu, V.ToZ));
	auto Ism = [&](UStaticMesh* M, UMaterialInterface* Mat)
	{
		UInstancedStaticMeshComponent* I = NewObject<UInstancedStaticMeshComponent>(A);
		I->SetStaticMesh(M); if (Mat) I->SetMaterial(0, Mat);
		I->SetMobility(EComponentMobility::Movable); I->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		I->SetReceivesDecals(false);
		I->SetupAttachment(Root); I->RegisterComponent(); A->AddInstanceComponent(I);
		return I;
	};
	UMaterialInterface* Madeira = MadeiraMat ? MadeiraMat.Get() : MastroMat.Get();
	UInstancedStaticMeshComponent* Pau = Ism(CylMesh, Madeira);
	UInstancedStaticMeshComponent* Tabua = Ism(CubeMesh, Madeira);
	UInstancedStaticMeshComponent* Bloco = Ism(CubeMesh, PedraMat ? PedraMat.Get() : MastroMat.Get());
	const float Diam = 0.12f;
	// postes: cantos + meio dos lados (lados maiores que 2 tiles ganham dois intermediarios)
	TArray<FVector2D> Postes;
	const int32 Nx = S.X >= 3 ? 3 : 2, Ny = S.Y >= 3 ? 3 : 2;
	for (int32 i = 0; i <= Nx; ++i) { const float X = -Hx + 2.f * Hx * i / Nx; Postes.Add(FVector2D(X, -Hy)); Postes.Add(FVector2D(X, Hy)); }
	for (int32 j = 1; j < Ny; ++j) { const float Y = -Hy + 2.f * Hy * j / Ny; Postes.Add(FVector2D(-Hx, Y)); Postes.Add(FVector2D(Hx, Y)); }
	for (const FVector2D& P : Postes) Pau->AddInstance(FTransform(FRotator::ZeroRotator, FVector(P.X, P.Y, Alt * 0.5f), FVector(Diam, Diam, Alt / 100.f)));
	// pisos de tabuas (faixa de 60 cm em volta) a 45 % e 85 % da altura
	for (const float Nivel : { 0.45f, 0.85f })
	{
		const float Z = Alt * Nivel;
		Tabua->AddInstance(FTransform(FRotator::ZeroRotator, FVector(0.f, -Hy, Z), FVector(Hx * 2.f / 100.f, 0.6f, 0.06f)));
		Tabua->AddInstance(FTransform(FRotator::ZeroRotator, FVector(0.f, Hy, Z), FVector(Hx * 2.f / 100.f, 0.6f, 0.06f)));
		Tabua->AddInstance(FTransform(FRotator::ZeroRotator, FVector(-Hx, 0.f, Z), FVector(0.6f, Hy * 2.f / 100.f, 0.06f)));
		Tabua->AddInstance(FTransform(FRotator::ZeroRotator, FVector(Hx, 0.f, Z), FVector(0.6f, Hy * 2.f / 100.f, 0.06f)));
	}
	// escoras em X nas faces (vigas diagonais finas)
	const float Dg = FMath::Sqrt(FMath::Square(2.f * Hx / Nx) + FMath::Square(Alt * 0.45f));
	const float Ang = FMath::RadiansToDegrees(FMath::Atan2(2.f * Hx / Nx, Alt * 0.45f));
	for (int32 i = 0; i < Nx; ++i)
	{
		const float Xm = -Hx + 2.f * Hx * (i + 0.5f) / Nx;
		for (const float Yf : { -Hy, Hy })
			Pau->AddInstance(FTransform(FRotator(Ang * ((i % 2) ? 1.f : -1.f), 0.f, 0.f), FVector(Xm, Yf, Alt * 0.225f), FVector(0.07f, 0.07f, Dg / 100.f)));
	}
	// pilha de blocos de pedra num canto de fora, e uma escada de tabuas encostada
	const FVector Pilha(Hx + 90.f, -Hy + 60.f, 0.f);
	for (int32 k = 0; k < 7; ++k)
	{
		const float Ox = (k % 3) * 62.f, Oy = ((k / 3) % 2) * 52.f, Oz = (k / 6) * 42.f;
		Bloco->AddInstance(FTransform(FRotator(0.f, Hash01(Id, 50 + k) * 12.f - 6.f, 0.f), Pilha + FVector(Ox, Oy, 21.f + Oz), FVector(0.58f, 0.48f, 0.42f)));
	}
	if (S.X >= 3 || S.Y >= 3)
	{
		// obra grande: guindaste grego de cavalete (dois paus inclinados sobre a obra, estais para tras, corda com um bloco
		// que sobe e desce) e uma carroca com blocos ao lado da pilha. Referencia do dono: templo em obra do Rise of Kingdoms
		auto Viga = [&](UInstancedStaticMeshComponent* I, const FVector& P0, const FVector& P1, float D)
		{
			const FVector Dv = P1 - P0;
			I->AddInstance(FTransform(FRotationMatrix::MakeFromZ(Dv).Rotator(), (P0 + P1) * 0.5f, FVector(D, D, Dv.Size() / 100.f)));
		};
		const float H = Alt * 1.45f;
		const FVector Topo(-Hx + 70.f, 0.f, H);
		for (const float Ly : { -110.f, 110.f }) Viga(Pau, FVector(-Hx - 170.f, Ly, 0.f), Topo, 0.22f);
		Viga(Pau, FVector(-Hx - 170.f, -110.f, 90.f), FVector(-Hx - 170.f, 110.f, 90.f), 0.10f);   // travessa do pe
		UInstancedStaticMeshComponent* Corda = Ism(CylMesh, MastroMat);
		for (const float Ly : { -60.f, 60.f }) Viga(Corda, Topo, FVector(-Hx - 520.f, Ly, 0.f), 0.025f);   // estais
		// corda de carga e o bloco: instancia 0 de cada, reposicionadas no Tick
		UInstancedStaticMeshComponent* Carga = Ism(CubeMesh, PedraMat ? PedraMat.Get() : MastroMat.Get());
		UInstancedStaticMeshComponent* CordaCarga = Ism(CylMesh, MastroMat);
		Carga->AddInstance(FTransform(FVector(Topo.X, 0.f, 60.f)));
		CordaCarga->AddInstance(FTransform(FVector(Topo.X, 0.f, H * 0.5f)));
		FAoEVisual* Vm = Buildings.Find(Id);
		if (Vm) { Vm->GuinCorda = CordaCarga; Vm->GuinCarga = Carga; Vm->GuinTopo = Topo; Vm->GuinFase = Hash01(Id, 60) * 6.28f; Vm->GuinAlt = Alt; }
		// carroca: leito de tabuas, duas rodas, varal, dois blocos em cima
		const FVector Ca(Hx + 120.f, Hy + 40.f, 0.f);
		Tabua->AddInstance(FTransform(FRotator::ZeroRotator, Ca + FVector(0.f, 0.f, 62.f), FVector(1.7f, 0.95f, 0.10f)));
		for (const float Ly : { -55.f, 55.f })
			Pau->AddInstance(FTransform(FRotator(0.f, 0.f, 90.f), Ca + FVector(-10.f, Ly, 42.f), FVector(0.84f, 0.84f, 0.10f)));   // rodas (eixo em Y)
		Viga(Pau, Ca + FVector(85.f, -25.f, 58.f), Ca + FVector(230.f, -18.f, 22.f), 0.06f);
		Viga(Pau, Ca + FVector(85.f, 25.f, 58.f), Ca + FVector(230.f, 18.f, 22.f), 0.06f);
		Bloco->AddInstance(FTransform(FRotator(0.f, 4.f, 0.f), Ca + FVector(-35.f, 0.f, 88.f), FVector(0.62f, 0.5f, 0.42f)));
		Bloco->AddInstance(FTransform(FRotator(0.f, -7.f, 0.f), Ca + FVector(35.f, 5.f, 88.f), FVector(0.55f, 0.48f, 0.42f)));
	}
	return A;
}

void AAoEBridgeActor::SetObraMats(FAoEVisual& V, bool bOn)
{
	UStaticMeshComponent* C = V.Body.Get();
	if (!C) return;
	if (bOn)
	{
		V.OrigMats.Reset(); V.CorteMids.Reset();
		for (int32 i = 0; i < C->GetNumMaterials(); ++i)
		{
			UMaterialInterface* O = C->GetMaterial(i);
			V.OrigMats.Add(O);
			UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(ObraMat, C);
			// copia as texturas do material original (mesmos nomes de parametro do M_Meshy)
			for (const TCHAR* P : { TEXT("BaseColorTexture"), TEXT("NormalTexture"), TEXT("MetallicRoughnessTexture") })
			{
				UTexture* T = nullptr;
				if (O && O->GetTextureParameterValue(FHashedMaterialParameterInfo(P), T) && T) M->SetTextureParameterValue(P, T);
			}
			float Mm = 0.f; if (O && O->GetScalarParameterValue(FHashedMaterialParameterInfo(TEXT("MetalMul")), Mm)) M->SetScalarParameterValue(TEXT("MetalMul"), Mm);
			C->SetMaterial(i, M);
			V.CorteMids.Add(M);
		}
		UE_LOG(LogTemp, Log, TEXT("AoE: obra %s com recorte: %d materiais, altura %.0f"), *V.Type, V.CorteMids.Num(), V.MeshHeight);
	}
	else
	{
		for (int32 i = 0; i < V.OrigMats.Num(); ++i) if (V.OrigMats[i].IsValid()) C->SetMaterial(i, V.OrigMats[i].Get());
		V.OrigMats.Reset(); V.CorteMids.Reset();
	}
}

void AAoEBridgeActor::AtualizaEstradas()
{
	// edificios com praca (fora lavoura, muralha e portao), em obra ou prontos, agrupados por dono
	TMap<int32, TArray<int32>> PorDono;
	for (const TPair<int32, FAoEVisual>& K : Buildings) if (K.Value.Plaza.IsValid()) PorDono.FindOrAdd(K.Value.Dono).Add(K.Key);
	for (auto It = Estradas.CreateIterator(); It; ++It)
		if (!PorDono.Contains(It->Key))
		{
			for (TWeakObjectPtr<AActor>& A : It->Value) if (A.IsValid()) A->Destroy();
			EstradaAssin.Remove(It->Key);
			It.RemoveCurrent();
		}
	for (TPair<int32, TArray<int32>>& P : PorDono)
	{
		P.Value.Sort();
		uint32 H = GetTypeHash(P.Value.Num());
		for (const int32 Id : P.Value) H = HashCombine(H, GetTypeHash(Id));
		if (Estradas.Contains(P.Key) && EstradaAssin.FindRef(P.Key) == H) continue;
		EstradaAssin.Add(P.Key, H);
		RefazEstradas(P.Key, P.Value);
	}
}

bool AAoEBridgeActor::CaminhoSeco(const FVector2D& A, const FVector2D& B) const
{
	// sem estrada atravessando agua (1 agua, 5 funda, 6 baixio) nem serra (2)
	if (MapTerrain.Num() != MapW * MapH || MapW <= 0) return true;
	const int32 N = FMath::Max(1, FMath::CeilToInt(FVector2D::Distance(A, B) * 2.f));
	for (int32 k = 0; k <= N; ++k)
	{
		const FVector2D Q = FMath::Lerp(A, B, (float)k / N);
		const int32 X = FMath::Clamp(FMath::FloorToInt(Q.X), 0, MapW - 1), Y = FMath::Clamp(FMath::FloorToInt(Q.Y), 0, MapH - 1);
		const uint8 T = MapTerrain[Y * MapW + X];
		if (T == 1 || T == 2 || T == 5 || T == 6) return false;
	}
	return true;
}

void AAoEBridgeActor::RefazEstradas(int32 Dono, const TArray<int32>& Ids)
{
	TArray<TWeakObjectPtr<AActor>>& L = Estradas.FindOrAdd(Dono);
	for (TWeakObjectPtr<AActor>& A : L) if (A.IsValid()) A->Destroy();
	L.Reset();
	if (!EstradaMat || Ids.Num() < 2) return;
	const float Uu = (float)UuPerTile;
	TArray<FVector2D> P;
	TArray<bool> Ligado;
	int32 NLig = 0;
	for (const int32 Id : Ids)
	{
		const FAoEVisual& V = Buildings[Id];
		P.Add(V.To);
		const bool bRaiz = V.Type == TEXT("town_center");
		Ligado.Add(bRaiz); NLig += bRaiz ? 1 : 0;
	}
	if (NLig == 0) Ligado[0] = true;   // sem Centro Civico: a rede comeca pelo edificio mais antigo (menor id)
	// Prim: a cada passo liga o edificio solto mais perto da rede (vira uma malha de ruas, nao uma estrela no Centro Civico)
	const float MaxTiles = 16.f;
	TArray<float> Melhor; Melhor.Init(1e9f, P.Num());
	TArray<int32> De; De.Init(-1, P.Num());
	auto Relaxa = [&](int32 j)
	{
		for (int32 i = 0; i < P.Num(); ++i)
			if (!Ligado[i]) { const float D = FVector2D::Distance(P[i], P[j]); if (D < Melhor[i]) { Melhor[i] = D; De[i] = j; } }
	};
	for (int32 i = 0; i < P.Num(); ++i) if (Ligado[i]) Relaxa(i);
	FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	for (;;)
	{
		int32 Best = -1;
		for (int32 i = 0; i < P.Num(); ++i) if (!Ligado[i] && (Best < 0 || Melhor[i] < Melhor[Best])) Best = i;
		if (Best < 0 || Melhor[Best] > MaxTiles) break;
		Ligado[Best] = true;
		Relaxa(Best);
		const FVector2D A = P[Best], B = P[De[Best]];
		if (!CaminhoSeco(A, B)) continue;
		const FVector2D D = B - A;
		const float Len = D.Size();
		if (Len < 0.5f) continue;
		// a caixa do decal cobre o desnivel do caminho (decal comprido sobre morro)
		float Zmin = 1e9f, Zmax = -1e9f;
		for (int32 k = 0; k <= 8; ++k) { const FVector2D Q = A + D * (k / 8.f); const float Z = GroundZ(Q.X * Uu, Q.Y * Uu); Zmin = FMath::Min(Zmin, Z); Zmax = FMath::Max(Zmax, Z); }
		const FVector2D M = (A + B) * 0.5f;
		// pitch -90: X do decal aponta para baixo, Z do decal segue o yaw (comprimento), Y atravessa (largura)
		ADecalActor* DA = GetWorld()->SpawnActor<ADecalActor>(FVector(M.X * Uu, M.Y * Uu, (Zmin + Zmax) * 0.5f), FRotator(-90.f, FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)), 0.f), Sp);
		if (!DA) continue;
		UDecalComponent* DC = DA->GetDecal();
		DC->SetMobility(EComponentMobility::Movable);
		DC->SetDecalMaterial(EstradaMat);
		DC->DecalSize = FVector(250.f + (Zmax - Zmin) * 0.5f, 0.42f * Uu, Len * 0.5f * Uu);
		DC->MarkRenderStateDirty();
		DC->SortOrder = -2;   // praca e lavoura por cima
		DC->SetFadeScreenSize(0.f);
		L.Add(DA);
		ZonasLimpar.Add({ FVector2D(M.X * Uu, M.Y * Uu), FVector2D(Len * 0.5f * Uu, 0.32f * Uu), (float)FMath::Atan2(D.Y, D.X) });
	}
	UE_LOG(LogTemp, Log, TEXT("AoE: dono %d: %d edificios, %d trechos de estrada"), Dono, Ids.Num(), L.Num());
}

void AAoEBridgeActor::LimpaPlantas()
{
	if (ZonasLimpar.Num() == 0) return;
	if (!bPlantasLidas)
	{
		// plantas do mapa = HISM estaticos de atores do nivel (arvores/nos, efeitos e canteiros sao do bridge e moveis)
		bPlantasLidas = true;
		for (TActorIterator<AActor> It(GetWorld()); It; ++It)
		{
			if (*It == this) continue;
			TInlineComponentArray<UHierarchicalInstancedStaticMeshComponent*> Cs(*It);
			for (UHierarchicalInstancedStaticMeshComponent* C : Cs) if (C && (C->Mobility == EComponentMobility::Static || *It == PlantasAtor)) Plantas.Add(C);
		}
		UE_LOG(LogTemp, Log, TEXT("AoE: %d grupos de plantas do mapa"), Plantas.Num());
	}
	int32 Total = 0;
	for (TWeakObjectPtr<UHierarchicalInstancedStaticMeshComponent>& W : Plantas)
	{
		UHierarchicalInstancedStaticMeshComponent* C = W.Get();
		if (!C || C->GetInstanceCount() == 0) continue;
		TSet<int32> Rem;
		for (const FAoEZona& Z : ZonasLimpar)
		{
			const float Co = FMath::Cos(Z.Yaw), Si = FMath::Sin(Z.Yaw);
			const float Ex = FMath::Abs(Co) * Z.H.X + FMath::Abs(Si) * Z.H.Y, Ey = FMath::Abs(Si) * Z.H.X + FMath::Abs(Co) * Z.H.Y;
			const FBox Caixa(FVector(Z.C.X - Ex, Z.C.Y - Ey, -1e6f), FVector(Z.C.X + Ex, Z.C.Y + Ey, 1e6f));
			for (const int32 i : C->GetInstancesOverlappingBox(Caixa, true))
			{
				FTransform T;
				if (!C->GetInstanceTransform(i, T, true)) continue;
				const float Dx = T.GetLocation().X - Z.C.X, Dy = T.GetLocation().Y - Z.C.Y;
				if (FMath::Abs(Dx * Co + Dy * Si) <= Z.H.X && FMath::Abs(-Dx * Si + Dy * Co) <= Z.H.Y) Rem.Add(i);
			}
		}
		if (Rem.Num() > 0) { C->RemoveInstances(Rem.Array()); Total += Rem.Num(); }
	}
	if (Total > 0) UE_LOG(LogTemp, Log, TEXT("AoE: %d plantas tiradas de %d pracas/estradas"), Total, ZonasLimpar.Num());
	ZonasLimpar.Reset();
}

void AAoEBridgeActor::PowerFx(const FString& Tipo, const FString& Fonte, const FVector& G, float RaioTiles, int32 Dono)
{
	// cada poder com a sua cor e forma, feito so de brilhos aditivos (M_Raio) e da poeira (M_Poeira) que ja existem
	const float Uu = (float)UuPerTile;
	const float Rt = FMath::Clamp(RaioTiles, 0.5f, 12.f);
	auto Brilho = [&](const FVector& P, const FVector& Size, const FLinearColor& C, float Dur, const FVector& Vel, float Cresce)
	{
		if (Glows.Num() >= 900) return;
		FAoEGlow Gw; Gw.P = P; Gw.Size = Size; Gw.Cor = C; Gw.Dur = Dur; Gw.V = Vel; Gw.Cresce = Cresce; Glows.Add(Gw);
	};
	// halo no chao (disco achatado) que pode se expandir
	auto HaloEm = [&](const FVector& P, float DiamUu, const FLinearColor& C, float Dur, float Cresce)
	{
		if (Glows.Num() >= 900) return;
		FAoEGlow Gw; Gw.P = P + FVector(0, 0, 18.f); Gw.Size = FVector(DiamUu / 100.f, DiamUu / 100.f, 1.f); Gw.Cor = C * 4.f; Gw.Dur = Dur; Gw.Cresce = Cresce; Gw.bHalo = true;
		Glows.Add(Gw);
	};
	auto Halo = [&](const FLinearColor& C, float Dur, float Cresce) { HaloEm(G, Rt * Uu * 2.f, C, Dur, Cresce); };
	auto Coluna = [&](const FLinearColor& C, float Alt, float Larg, float Dur) { Brilho(G + FVector(0, 0, Alt * 0.5f), FVector(Larg, Larg, Alt / 100.f), C, Dur, FVector::ZeroVector, 0.f); };
	// faiscas: N pontos no raio subindo
	auto Faiscas = [&](int32 N, const FLinearColor& C, float Dur, float Vz, float Z0, float Tam)
	{
		for (int32 i = 0; i < N; ++i)
		{
			const float A = FMath::FRand() * 2.f * PI, D = FMath::Sqrt(FMath::FRand()) * Rt * Uu;
			const FVector P = G + FVector(FMath::Cos(A) * D, FMath::Sin(A) * D, Z0 + FMath::FRand() * 60.f);
			Brilho(P, FVector(Tam, Tam, Tam * 2.2f), C, Dur * (0.7f + 0.6f * FMath::FRand()),
				FVector((FMath::FRand() - 0.5f) * 40.f, (FMath::FRand() - 0.5f) * 40.f, Vz * (0.7f + 0.6f * FMath::FRand())), 0.f);
		}
	};
	// poeira espalhada no raio (Escuro < 0 = clara/espuma)
	auto Nevoa = [&](int32 N, float R0, float R1, float Dur, float Escuro)
	{
		for (int32 i = 0; i < N; ++i)
		{
			const float A = FMath::FRand() * 2.f * PI, D = FMath::Sqrt(FMath::FRand()) * Rt * Uu;
			AddPuffs(G + FVector(FMath::Cos(A) * D, FMath::Sin(A) * D, 0.f), 1, R0, R1, Dur, Escuro, 60.f);
		}
	};
	const int32 Muitas = FMath::Clamp((int32)(Rt * 8.f), 12, 60);
	const FString K = Tipo == TEXT("divine") ? Fonte : Tipo;

	if (K == TEXT("heal") || K == TEXT("restoration") || K == TEXT("spring"))
	{
		// cura / primavera: anel verde-dourado e luzinhas subindo devagar
		const FLinearColor C = K == TEXT("spring") ? FLinearColor(0.45f, 1.f, 0.35f) : FLinearColor(0.7f, 1.f, 0.45f);
		Halo(C * 0.05f, 3.5f, 0.15f);
		Faiscas(Muitas, C * 1.4f, 3.f, 110.f, 30.f, 0.12f);
	}
	else if (K == TEXT("pestilence"))
	{
		// peste: nevoa escura e baixa no raio, brilho doentio esverdeado por baixo
		Nevoa(FMath::Clamp((int32)(Rt * 4.f), 8, 40), 120.f, 340.f, 6.f, 0.75f);
		Halo(FLinearColor(0.35f, 0.55f, 0.08f) * 0.05f, 6.f, 0.f);
	}
	else if (K == TEXT("curse"))
	{
		Coluna(FLinearColor(0.55f, 0.15f, 1.f) * 0.5f, 380.f, 0.6f, 1.2f);
		Faiscas(10, FLinearColor(0.6f, 0.2f, 1.f) * 1.5f, 1.4f, 60.f, 20.f, 0.1f);
	}
	else if (K == TEXT("spawn") || K == TEXT("lure") || K == TEXT("sentinel") || K == TEXT("plenty"))
	{
		// invocacao: clarao branco-azulado em coluna e anel que se abre
		Coluna(FLinearColor(0.75f, 0.85f, 1.f) * 0.7f, 900.f, 0.9f, 0.9f);
		HaloEm(G, 240.f, FLinearColor(0.7f, 0.85f, 1.f) * 0.12f, 1.2f, 1.2f);
		AddPuffs(G, 5, 50.f, 180.f, 1.6f, 0.f, 160.f);
	}
	else if (K == TEXT("evolve"))
	{
		Coluna(FLinearColor(0.6f, 0.85f, 1.f) * 0.45f, 420.f, 0.7f, 1.4f);
		Faiscas(14, FLinearColor(0.7f, 0.9f, 1.f) * 1.4f, 1.6f, 160.f, 20.f, 0.09f);
	}
	else if (K == TEXT("petrify"))
	{
		AddPuffs(G, 6, 40.f, 140.f, 2.f, 0.f, 80.f);
		Coluna(FLinearColor(0.8f, 0.8f, 0.75f) * 0.3f, 250.f, 0.8f, 0.8f);
	}
	else if (K == TEXT("titanRise"))
	{
		// Tita surgindo: anel de poeira, brilho alaranjado de dentro da terra, brasas subindo
		for (int32 i = 0; i < 24; ++i) { const float A = i / 24.f * 2.f * PI; AddPuffs(G + FVector(FMath::Cos(A), FMath::Sin(A), 0.f) * 4.f * Uu, 1, 160.f, 480.f, 6.f, 0.2f, 150.f); }
		HaloEm(G, 800.f, FLinearColor(1.f, 0.45f, 0.1f) * 0.12f, 5.f, 0.5f);
		Faiscas(40, FLinearColor(1.f, 0.5f, 0.15f) * 2.f, 3.f, 260.f, 10.f, 0.14f);
	}
	else if (K == TEXT("ability"))
	{
		// habilidade de heroi: anel dourado que se expande do heroi ate o raio
		HaloEm(G, 100.f, FLinearColor(1.f, 0.8f, 0.35f) * 0.25f, 0.8f, Rt * Uu * 2.f / 100.f);
		Faiscas(12, FLinearColor(1.f, 0.85f, 0.45f) * 1.5f, 1.f, 120.f, 30.f, 0.12f);
	}
	else if (K == TEXT("bronze"))
	{
		// pele de bronze: brilho dourado curto em cada unidade do dono
		int32 N = 0;
		for (const TPair<int32, FAoEVisual>& U : Units)
		{
			if (U.Value.Dono != Dono || N >= 120) continue;
			Brilho(U.Value.GroundPoint + FVector(0, 0, 90.f), FVector(0.9f, 0.9f, 1.9f), FLinearColor(1.f, 0.62f, 0.25f) * 0.18f, 1.6f, FVector::ZeroVector, 0.f);
			++N;
		}
	}
	else if (K == TEXT("nodeGone")) AddPuffs(G, 3, 40.f, 140.f, 1.6f, 0.f, 70.f);
	else if (K == TEXT("panic") || K == TEXT("retribution"))
	{
		const FLinearColor C = K == TEXT("panic") ? FLinearColor(0.9f, 0.2f, 0.35f) : FLinearColor(1.f, 0.15f, 0.08f);
		Halo(C * 0.07f, 2.2f, 0.35f);
		Faiscas(Muitas, C * 1.6f, 1.6f, 200.f, 30.f, 0.12f);
	}
	else if (K == TEXT("crossroads"))
	{
		Halo(FLinearColor(0.5f, 0.25f, 1.f) * 0.08f, 2.5f, 0.2f);
		Coluna(FLinearColor(0.55f, 0.3f, 1.f) * 0.5f, 1100.f, 1.1f, 1.6f);
	}
	else if (K == TEXT("gale"))
	{
		// vendaval: rajadas de poeira clara varrendo o raio
		for (int32 i = 0; i < FMath::Clamp((int32)(Rt * 4.f), 8, 36); ++i)
		{
			FAoEPuff F; const float A = FMath::FRand() * 2.f * PI, D = FMath::Sqrt(FMath::FRand()) * Rt * Uu;
			F.P = G + FVector(FMath::Cos(A) * D, FMath::Sin(A) * D, 40.f);
			F.V = FVector(900.f, 300.f, 60.f) * (0.6f + 0.6f * FMath::FRand()); F.R0 = 60.f; F.R1 = 260.f; F.Dur = 2.2f; F.Dark = -0.3f;
			if (Puffs.Num() < 400) Puffs.Add(F);
		}
	}
	else if (K == TEXT("tidal_wave"))
	{
		// maremoto: espuma e borrifo brancos no raio, brilho azul-esverdeado
		Nevoa(FMath::Clamp((int32)(Rt * 5.f), 10, 45), 80.f, 260.f, 2.4f, -0.6f);
		Halo(FLinearColor(0.15f, 0.6f, 0.75f) * 0.08f, 2.5f, 0.3f);
	}
	else if (K == TEXT("divine_harvest"))
	{
		Halo(FLinearColor(1.f, 0.82f, 0.3f) * 0.06f, 3.f, 0.1f);
		Faiscas(Muitas, FLinearColor(1.f, 0.85f, 0.35f) * 1.4f, 2.6f, 90.f, 30.f, 0.12f);
	}
	else if (K == TEXT("sun_chariot"))
	{
		// carro do sol: chao queimando, brilho quente e o clarao da cena
		Nevoa(10, 60.f, 200.f, 2.f, 0.35f);
		Halo(FLinearColor(1.f, 0.55f, 0.15f) * 0.12f, 2.f, 0.25f);
		Coluna(FLinearColor(1.f, 0.75f, 0.35f) * 0.6f, 1400.f, 1.4f, 1.f);
		if (FlashLight) { FlashLight->SetWorldLocation(G + FVector(0, 0, 800.f)); FlashT = 0.f; }
	}
	else if (K == TEXT("winged_victory"))
	{
		Halo(FLinearColor(1.f, 0.95f, 0.75f) * 0.07f, 2.5f, 0.25f);
		Faiscas(30, FLinearColor(1.f, 0.95f, 0.8f) * 1.6f, 2.f, 240.f, 30.f, 0.12f);
	}
	else if (K == TEXT("phoenix"))
	{
		AddPuffs(G, 4, 50.f, 180.f, 1.5f, 0.3f, 60.f);
		Coluna(FLinearColor(1.f, 0.5f, 0.12f) * 0.7f, 700.f, 1.f, 1.2f);
		Faiscas(24, FLinearColor(1.f, 0.55f, 0.15f) * 2.f, 1.8f, 220.f, 30.f, 0.12f);
	}
	else if (Tipo == TEXT("divine"))
	{
		// poder sem visual proprio: halo dourado e coluna de luz (o de antes)
		Halo(FLinearColor(1.f, 0.78f, 0.35f) * 0.06f, 1.6f, 0.f);
		Coluna(FLinearColor(1.f, 0.82f, 0.45f) * 0.35f, 1200.f, 0.35f, 1.2f);
	}
}

void AAoEBridgeActor::MontarTerreno()
{
	// U3: terreno montado aqui a partir do relevo recebido; o Landscape do mapa (se houver) fica escondido e sem colisao
	if (!RelevoCab.IsValid() || FParse::Param(FCommandLine::Get(), TEXT("AoESemRelevo"))) return;
	TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
	for (const auto& KV : RelevoCab->Values) R->SetField(KV.Key, KV.Value);
	for (const TPair<FString, FString>& KV : RelevoAcum) R->SetStringField(KV.Key, KV.Value);
	if (Terreno) Terreno->Destroy();
	Terreno = GetWorld()->SpawnActor<AAoETerreno>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!Terreno->Montar(R, (float)MapW * (float)UuPerTile)) { UE_LOG(LogTemp, Warning, TEXT("AoE: relevo invalido")); Terreno->Destroy(); Terreno = nullptr; }
	else for (TActorIterator<AActor> It(GetWorld()); It; ++It) if (It->GetClass()->GetName().Contains(TEXT("Landscape"))) { It->SetActorHiddenInGame(true); It->SetActorEnableCollision(false); }
	RelevoAcum.Empty();
}

void AAoEBridgeActor::ReceberPlantas(const TSharedPtr<FJsonObject>& O)
{
	// U3: vegetacao rasteira e rochas sorteadas pelo servidor (u3-plantas.ts, mesma regra do u1_plantas.mjs), em lotes
	bool bFim = false;
	if (O->TryGetBoolField(TEXT("fim"), bFim) && bFim) { bPlantasLidas = false; UE_LOG(LogTemp, Log, TEXT("AoE: plantas recebidas")); return; }
	if (FParse::Param(FCommandLine::Get(), TEXT("AoESemRelevo"))) return;
	FString Grupo;
	if (!O->TryGetStringField(TEXT("grupo"), Grupo)) return;
	const TArray<TSharedPtr<FJsonValue>>* Ms = nullptr;
	if (O->TryGetArrayField(TEXT("malhas"), Ms)) { TArray<FString>& L = PlantasMalhas.FindOrAdd(Grupo); L.Reset(); for (const auto& M : *Ms) L.Add(M->AsString()); }
	const TArray<FString>* Malhas = PlantasMalhas.Find(Grupo);
	const TArray<TSharedPtr<FJsonValue>>* P = nullptr;
	if (!Malhas || !O->TryGetArrayField(TEXT("p"), P)) return;
	if (!PlantasAtor)
	{
		PlantasAtor = GetWorld()->SpawnActor<AActor>(FVector::ZeroVector, FRotator::ZeroRotator);
		USceneComponent* Raiz = NewObject<USceneComponent>(PlantasAtor); PlantasAtor->SetRootComponent(Raiz); Raiz->RegisterComponent();
	}
	const float DistFim = Grupo == TEXT("capim") ? 5500.f : Grupo == TEXT("flores") ? 6500.f : Grupo == TEXT("samambaias") ? 8000.f : 30000.f;
	const bool bSombra = Grupo == TEXT("samambaias") || Grupo == TEXT("rochas");
	TMap<int32, TArray<FTransform>> PorMalha;
	for (int32 i = 0; i + 6 < P->Num(); i += 7)
	{
		const int32 K = FMath::Clamp((int32)(*P)[i + 4]->AsNumber(), 0, Malhas->Num() - 1);
		const float E = (float)(*P)[i + 5]->AsNumber();
		PorMalha.FindOrAdd(K).Add(FTransform(FRotator((float)(*P)[i + 6]->AsNumber(), (float)(*P)[i + 3]->AsNumber(), 0.f),
			FVector((float)(*P)[i]->AsNumber(), (float)(*P)[i + 1]->AsNumber(), (float)(*P)[i + 2]->AsNumber()), FVector(E)));
	}
	for (TPair<int32, TArray<FTransform>>& KV : PorMalha)
	{
		const FString Chave = FString::Printf(TEXT("%s/%d"), *Grupo, KV.Key);
		TObjectPtr<UHierarchicalInstancedStaticMeshComponent>* Achou = PlantasComps.Find(Chave);
		UHierarchicalInstancedStaticMeshComponent* C = Achou ? Achou->Get() : nullptr;
		if (!C)
		{
			FString Pasta, Nome; (*Malhas)[KV.Key].Split(TEXT("/"), &Pasta, &Nome);
			UStaticMesh* Mesh = LoadMesh(FString::Printf(TEXT("/Game/Vegetacao/%s/%s/StaticMeshes/%s"), *Pasta, *Pasta, *Nome));
			if (!Mesh) continue;
			C = NewObject<UHierarchicalInstancedStaticMeshComponent>(PlantasAtor);
			C->SetStaticMesh(Mesh);
			C->SetMobility(EComponentMobility::Movable);
			C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			C->SetCastShadow(bSombra);
			C->SetCullDistances(0, (int32)DistFim);
			C->AttachToComponent(PlantasAtor->GetRootComponent(), FAttachmentTransformRules::KeepRelativeTransform);
			PlantasAtor->AddInstanceComponent(C);
			C->RegisterComponent();
			PlantasComps.Add(Chave, C);
		}
		C->AddInstances(KV.Value, false, true);
	}
}
