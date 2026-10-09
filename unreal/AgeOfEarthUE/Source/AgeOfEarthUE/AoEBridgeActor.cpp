#include "AoEBridgeActor.h"

#include "WebSocketsModule.h"
#include "IWebSocket.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/StaticMesh.h"
#include "Engine/Engine.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "TimerManager.h"
#include "CollisionQueryParams.h"
#include "Engine/World.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

AAoEBridgeActor::AAoEBridgeActor()
{
	PrimaryActorTick.bCanEverTick = true;
	CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	BoxMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
}

void AAoEBridgeActor::BeginPlay()
{
	Super::BeginPlay();
	FString Override;
	if (FParse::Value(FCommandLine::Get(), TEXT("AoEUrl="), Override)) Url = Override;
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
	// uma nova partida: apaga as caixas antigas
	for (auto& P : Units) if (P.Value.Actor.IsValid()) P.Value.Actor->Destroy();
	for (auto& P : Buildings) if (P.Value.Actor.IsValid()) P.Value.Actor->Destroy();
	Units.Empty(); Buildings.Empty(); ActorToUnit.Empty(); Selected.Empty();
	MyPlayer = (int32)O->GetNumberField(TEXT("player"));
	UuPerTile = (int32)O->GetNumberField(TEXT("uuPerTile"));
	const double TickRate = FMath::Max(1.0, O->GetNumberField(TEXT("tickRate")));
	StateInterval = (float)(O->GetNumberField(TEXT("stateEvery")) / TickRate);
	PlayerColors.Empty();
	const TArray<TSharedPtr<FJsonValue>>* Players = nullptr;
	if (O->TryGetArrayField(TEXT("players"), Players))
		for (const auto& V : *Players)
		{
			const TSharedPtr<FJsonObject> P = V->AsObject();
			if (!P.IsValid()) continue;
			PlayerColors.Add((int32)P->GetNumberField(TEXT("id")), (uint32)P->GetNumberField(TEXT("color")));
		}
	UnitRadius.Empty();
	const TSharedPtr<FJsonObject>* UT = nullptr;
	if (O->TryGetObjectField(TEXT("unitTypes"), UT))
		for (const auto& KV : (*UT)->Values)
		{
			double R = 0.4;
			const TSharedPtr<FJsonObject> Def = KV.Value->AsObject();
			if (Def.IsValid()) Def->TryGetNumberField(TEXT("radius"), R);
			const float Rf = (float)R;
			UnitRadius.Add(FString(KV.Key), Rf);
		}
	UE_LOG(LogTemp, Log, TEXT("AoE: hello (jogador %d, %d jogadores, state a cada %.2f s)"), MyPlayer, PlayerColors.Num(), StateInterval);
}

FLinearColor AAoEBridgeActor::PlayerColor(int32 Dono) const
{
	const uint32* C = PlayerColors.Find(Dono);
	const uint32 V = C ? *C : 0x888888;
	return FLinearColor::FromSRGBColor(FColor((V >> 16) & 0xFF, (V >> 8) & 0xFF, V & 0xFF));
}

AStaticMeshActor* AAoEBridgeActor::SpawnBox(const FLinearColor& Color)
{
	FActorSpawnParameters Sp;
	Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AStaticMeshActor* A = GetWorld()->SpawnActor<AStaticMeshActor>(FVector::ZeroVector, FRotator::ZeroRotator, Sp);
	UStaticMeshComponent* C = A->GetStaticMeshComponent();
	C->SetMobility(EComponentMobility::Movable);
	C->SetStaticMesh(CubeMesh);
	// a caixa nao atrapalha a busca do chao (tipo WorldStatic) mas pode ser clicada (canal Visibility)
	C->SetCollisionObjectType(ECC_WorldDynamic);
	C->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	C->SetCollisionResponseToAllChannels(ECR_Ignore);
	C->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(BoxMaterial, A);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	C->SetMaterial(0, M);
	return A;
}

float AAoEBridgeActor::GroundZ(float X, float Y) const
{
	FHitResult Hit;
	FCollisionObjectQueryParams Obj(ECC_WorldStatic);
	if (GetWorld()->LineTraceSingleByObjectType(Hit, FVector(X, Y, 60000.f), FVector(X, Y, -60000.f), Obj))
		return Hit.ImpactPoint.Z;
	return 0.f;
}

void AAoEBridgeActor::HandleState(const TSharedPtr<FJsonObject>& O)
{
	++StateSerial;
	bHaveState = true;
	LastTick = (int32)O->GetNumberField(TEXT("tick"));
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
			FAoEVisual* Vis = Units.Find(Id);
			if (!Vis)
			{
				Vis = &Units.Add(Id);
				const float R = UnitRadius.FindRef(U->GetStringField(TEXT("t")));
				const float W = FMath::Max(0.6f, FMath::Max(R, 0.25f) * 2.f * Uu / 100.f * 0.9f);   // largura em cubos de 1 m
				Vis->Scale = FVector(W, W, 1.8f);
				Vis->Actor = SpawnBox(PlayerColor(Dono));
				Vis->Dono = Dono;
				Vis->From = Pos;
				Vis->FromZ = GroundZ(Pos.X * Uu, Pos.Y * Uu);
				Vis->Alpha = 1.f;
				ActorToUnit.Add(Vis->Actor.Get(), Id);
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
			if (D.SizeSquared() > 1e-6f) Vis->Yaw = FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X));
			Vis->Serial = StateSerial;
			if (Dono == MyPlayer) { Sum += Pos; ++NMine; }
		}
	for (auto It = Units.CreateIterator(); It; ++It)
		if (It->Value.Serial != StateSerial)
		{
			if (It->Value.Actor.IsValid()) { ActorToUnit.Remove(It->Value.Actor.Get()); It->Value.Actor->Destroy(); }
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
			const float Prog = FMath::Clamp((float)B->GetNumberField(TEXT("p")), 0.15f, 1.f);
			const FVector2D Center((float)B->GetNumberField(TEXT("tx")) + W * 0.5f, (float)B->GetNumberField(TEXT("ty")) + H * 0.5f);
			FAoEVisual* Vis = Buildings.Find(Id);
			if (!Vis)
			{
				Vis = &Buildings.Add(Id);
				Vis->bBuilding = true;
				Vis->Dono = Dono;
				Vis->Actor = SpawnBox(PlayerColor(Dono) * 0.7f);
				Vis->From = Vis->To = Center;
				Vis->FromZ = Vis->ToZ = GroundZ(Center.X * Uu, Center.Y * Uu);
				Vis->Alpha = 1.f;
			}
			Vis->Scale = FVector(W * Uu / 100.f * 0.92f, H * Uu / 100.f * 0.92f, 4.f * Prog);
			Vis->Serial = StateSerial;
		}
		for (auto It = Buildings.CreateIterator(); It; ++It)
			if (It->Value.Serial != StateSerial)
			{
				if (It->Value.Actor.IsValid()) It->Value.Actor->Destroy();
				It.RemoveCurrent();
			}
	}
}

void AAoEBridgeActor::UpdateVisual(FAoEVisual& V, float Dt)
{
	AStaticMeshActor* A = V.Actor.Get();
	if (!A) return;
	V.Alpha = FMath::Min(1.f, V.Alpha + Dt / FMath::Max(StateInterval, 0.02f));
	const FVector2D P = FMath::Lerp(V.From, V.To, V.Alpha);
	const float Z = FMath::Lerp(V.FromZ, V.ToZ, V.Alpha);
	A->SetActorScale3D(V.Scale);
	A->SetActorLocationAndRotation(FVector(P.X * UuPerTile, P.Y * UuPerTile, Z + V.Scale.Z * 50.f), FRotator(0.f, V.Yaw, 0.f));
}

void AAoEBridgeActor::Tick(float Dt)
{
	Super::Tick(Dt);
	for (auto& P : Units)
	{
		P.Value.Scale.Z = Selected.Contains(P.Key) ? 2.6f : 1.8f;   // a selecionada fica mais alta
		UpdateVisual(P.Value, Dt);
	}
	for (auto& P : Buildings) UpdateVisual(P.Value, Dt);
	if (GEngine)
		GEngine->AddOnScreenDebugMessage(101, 0.f, bConnected ? FColor::White : FColor::Red,
			FString::Printf(TEXT("Age of Earth U0 | %s | tick %d | unidades %d | edificios %d | selecionadas %d"),
				bConnected ? TEXT("ponte conectada") : TEXT("sem ponte (rode: npm run unreal:sim)"), LastTick, Units.Num(), Buildings.Num(), Selected.Num()));
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
