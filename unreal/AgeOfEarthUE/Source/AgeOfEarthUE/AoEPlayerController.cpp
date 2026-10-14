#include "AoEPlayerController.h"

#include "AoEBridgeActor.h"
#include "EngineUtils.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Components/SceneComponent.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Engine/World.h"
#include "InputCoreTypes.h"

AAoECameraPawn::AAoECameraPawn()
{
	PrimaryActorTick.bCanEverTick = false;
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("Arm"));
	Arm->SetupAttachment(Root);
	Arm->bDoCollisionTest = false;
	Arm->TargetArmLength = 8000.f;
	Arm->SetUsingAbsoluteRotation(true);
	// olhando para -Y (tela: direita = +X, cima = -Y, como no jogo web), inclinada 50 graus
	Arm->SetRelativeRotation(FRotator(-50.f, -90.f, 0.f));
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Arm);
	Camera->FieldOfView = 55.f;
}

AAoEPlayerController::AAoEPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = true;
	PrimaryActorTick.bCanEverTick = true;
}

AAoEBridgeActor* AAoEPlayerController::Bridge()
{
	if (!BridgeRef.IsValid())
		for (TActorIterator<AAoEBridgeActor> It(GetWorld()); It; ++It) { BridgeRef = *It; break; }
	return BridgeRef.Get();
}

void AAoEPlayerController::FocusCameraOnArmy()
{
	AAoEBridgeActor* B = Bridge();
	APawn* P = GetPawn();
	if (!B || !B->bHaveState) return;
	if (!P) { UE_LOG(LogTemp, Warning, TEXT("AoE: sem pawn de camera")); bCameraPlaced = true; return; }
	const float Uu = (float)B->UuPerTile;
	const float X = B->MyCentroidTiles.X * Uu, Y = B->MyCentroidTiles.Y * Uu;
	// a camera olha para -Y a partir de um ponto mais ao sul (Y maior), por causa da inclinacao
	P->SetActorLocation(FVector(X, Y, B->GroundZ(X, Y)));
	SetViewTarget(P);
	UE_LOG(LogTemp, Log, TEXT("AoE: camera em %s (tile %.1f, %.1f), chao z=%.0f"), *P->GetActorLocation().ToString(), B->MyCentroidTiles.X, B->MyCentroidTiles.Y, B->GroundZ(X, Y));
	bCameraPlaced = true;
	bAutoTest = FParse::Param(FCommandLine::Get(), TEXT("AoEAutoTest"));
	FString ShotSpec;
	if (FParse::Value(FCommandLine::Get(), TEXT("AoEShots="), ShotSpec))
	{
		TArray<FString> Items;
		ShotSpec.ParseIntoArray(Items, TEXT(";"));
		for (const FString& It : Items)
		{
			TArray<FString> F;
			It.ParseIntoArray(F, TEXT(":"));
			if (F.Num() < 3) continue;
			FShot S;
			S.Name = F[0]; S.X = FCString::Atof(*F[1]); S.Y = FCString::Atof(*F[2]);
			if (F.Num() > 3) S.Arm = FCString::Atof(*F[3]);
			if (F.Num() > 4) S.Pitch = FCString::Atof(*F[4]);
			if (F.Num() > 5) S.Yaw = FCString::Atof(*F[5]);
			Shots.Add(S);
		}
	}
	FParse::Value(FCommandLine::Get(), TEXT("AoEShotDir="), ShotDir);
	FParse::Value(FCommandLine::Get(), TEXT("AoEDelay="), AutoDelay);
	if (AAoECameraPawn* CamPawn = Cast<AAoECameraPawn>(P))
	{
		float Len = 0.f, Pitch = 0.f, FX = 0.f, FY = 0.f;
		if (FParse::Value(FCommandLine::Get(), TEXT("AoEArm="), Len)) CamPawn->Arm->TargetArmLength = Len;
		if (FParse::Value(FCommandLine::Get(), TEXT("AoEPitch="), Pitch)) CamPawn->Arm->SetRelativeRotation(FRotator(Pitch, -90.f, 0.f));
		if (FParse::Value(FCommandLine::Get(), TEXT("AoETileX="), FX) && FParse::Value(FCommandLine::Get(), TEXT("AoETileY="), FY))
			P->SetActorLocation(FVector(FX * Uu, FY * Uu, B->GroundZ(FX * Uu, FY * Uu)));
	}
}

void AAoEPlayerController::AoEMove(float TileX, float TileY)
{
	AAoEBridgeActor* B = Bridge();
	if (!B) return;
	TArray<int32> Ids = B->GetSelected().Array();
	if (Ids.Num() == 0) Ids = B->MyUnitIds();
	B->SendMove(Ids, TileX, TileY);
}

void AAoEPlayerController::ContextOrder(float TileX, float TileY, bool bQueue)
{
	AAoEBridgeActor* B = Bridge();
	if (!B) return;
	TArray<int32> Ids = B->GetSelected().Array();
	if (Ids.Num() == 0) return;   // sem selecao nao se manda ordem a ninguem (so o console AoEMove usa "todas")
	int32 Target = 0; FString Kind;
	if (B->PickTarget(TileX, TileY, Target, Kind))
		B->SendCmd(Kind, Ids, FString::Printf(TEXT("\"targetId\":%d"), Target), bQueue);
	else if (bQueue)
		B->SendCmd(TEXT("move"), Ids, FString::Printf(TEXT("\"x\":%.2f,\"y\":%.2f"), TileX, TileY), true);
	else
		B->SendMove(Ids, TileX, TileY);
}

void AAoEPlayerController::PlayerTick(float Dt)
{
	Super::PlayerTick(Dt);
	AAoEBridgeActor* B = Bridge();
	if (!B) return;
	if (!bCameraPlaced) { FocusCameraOnArmy(); }

	APawn* P = GetPawn();
	if (P)
	{
		// camera: WASD / setas
		FVector2D Dir(0.f, 0.f);
		if (IsInputKeyDown(EKeys::W) || IsInputKeyDown(EKeys::Up)) Dir.Y -= 1.f;
		if (IsInputKeyDown(EKeys::S) || IsInputKeyDown(EKeys::Down)) Dir.Y += 1.f;
		if (IsInputKeyDown(EKeys::D) || IsInputKeyDown(EKeys::Right)) Dir.X += 1.f;
		if (IsInputKeyDown(EKeys::A) || IsInputKeyDown(EKeys::Left)) Dir.X -= 1.f;
		AAoECameraPawn* Cam = Cast<AAoECameraPawn>(P);
		if (Cam && !Dir.IsNearlyZero())
		{
			const float Speed = Cam->Arm->TargetArmLength * 0.9f;
			Dir.Normalize();
			P->AddActorWorldOffset(FVector(Dir.X, Dir.Y, 0.f) * Speed * Dt);
		}
		// zoom: roda do mouse
		if (Cam)
		{
			if (WasInputKeyJustPressed(EKeys::MouseScrollUp)) Cam->Arm->TargetArmLength = FMath::Clamp(Cam->Arm->TargetArmLength * 0.85f, 600.f, 14000.f);
			if (WasInputKeyJustPressed(EKeys::MouseScrollDown)) Cam->Arm->TargetArmLength = FMath::Clamp(Cam->Arm->TargetArmLength / 0.85f, 600.f, 14000.f);
		}
	}

	// selecao
	if (WasInputKeyJustPressed(EKeys::Q))
	{
		TSet<int32> All;
		for (int32 Id : B->MyUnitIds()) All.Add(Id);
		B->SetSelected(All);
	}
	const bool bShift = IsInputKeyDown(EKeys::LeftShift) || IsInputKeyDown(EKeys::RightShift);
	const bool bCtrl = IsInputKeyDown(EKeys::LeftControl) || IsInputKeyDown(EKeys::RightControl);
	if (WasInputKeyJustPressed(EKeys::A) && !bCtrl) bAttackMoveArmed = true;
	if (WasInputKeyJustPressed(EKeys::S) && !bCtrl) B->SendCmd(TEXT("stop"), B->GetSelected().Array(), FString(), false);
	if (WasInputKeyJustPressed(EKeys::Escape)) bAttackMoveArmed = false;
	// grupos de controle
	static const FKey NumKeys[10] = { EKeys::Zero, EKeys::One, EKeys::Two, EKeys::Three, EKeys::Four, EKeys::Five, EKeys::Six, EKeys::Seven, EKeys::Eight, EKeys::Nine };
	for (int32 G = 0; G < 10; ++G)
		if (WasInputKeyJustPressed(NumKeys[G]))
		{
			if (bCtrl) Groups[G] = B->GetSelected();
			else if (Groups[G].Num() > 0)
			{
				TSet<int32> Vivos;   // so os que ainda existem
				for (int32 Id : Groups[G]) if (B->GetUnits().Contains(Id)) Vivos.Add(Id);
				Groups[G] = Vivos;
				B->SetSelected(Vivos);
			}
		}
	// esquerdo: A armado = atacar-mover; senao clique seleciona e arrastar faz caixa
	float MX = 0.f, MY = 0.f;
	GetMousePosition(MX, MY);
	if (WasInputKeyJustPressed(EKeys::LeftMouseButton))
	{
		if (bAttackMoveArmed)
		{
			FHitResult Hit;
			TArray<int32> Ids = B->GetSelected().Array();
			if (Ids.Num() > 0 && GetHitResultUnderCursor(ECC_Visibility, false, Hit))
				B->SendCmd(TEXT("attackMove"), Ids, FString::Printf(TEXT("\"x\":%.2f,\"y\":%.2f"), Hit.ImpactPoint.X / B->UuPerTile, Hit.ImpactPoint.Y / B->UuPerTile), bShift);
			bAttackMoveArmed = false;
		}
		else { bDragging = true; DragStart = FVector2D(MX, MY); }
	}
	if (bDragging && WasInputKeyJustReleased(EKeys::LeftMouseButton))
	{
		bDragging = false;
		TSet<int32> Sel = bShift ? B->GetSelected() : TSet<int32>();
		const FVector2D End(MX, MY);
		if (FVector2D::Distance(DragStart, End) > 8.f)
		{
			const FVector2D Lo(FMath::Min(DragStart.X, End.X), FMath::Min(DragStart.Y, End.Y)), Hi(FMath::Max(DragStart.X, End.X), FMath::Max(DragStart.Y, End.Y));
			for (const TPair<int32, FAoEVisual>& K : B->GetUnits())
			{
				if (K.Value.Dono != B->MyPlayer || !K.Value.Actor.IsValid()) continue;
				FVector2D Sc;
				if (ProjectWorldLocationToScreen(K.Value.Actor->GetActorLocation() + FVector(0, 0, 90.f), Sc) && Sc.X >= Lo.X && Sc.X <= Hi.X && Sc.Y >= Lo.Y && Sc.Y <= Hi.Y) Sel.Add(K.Key);
			}
		}
		else
		{
			FHitResult Hit;
			GetHitResultUnderCursor(ECC_Visibility, false, Hit);
			int32 Id = 0, Dono = -1;
			if (Hit.GetActor() && B->UnitIdOf(Hit.GetActor(), Id, Dono) && Dono == B->MyPlayer) Sel.Add(Id);
		}
		B->SetSelected(Sel);
	}
	// direito: ordem contextual
	if (WasInputKeyJustPressed(EKeys::RightMouseButton))
	{
		bAttackMoveArmed = false;
		FHitResult Hit;
		if (GetHitResultUnderCursor(ECC_Visibility, false, Hit))
			ContextOrder(Hit.ImpactPoint.X / B->UuPerTile, Hit.ImpactPoint.Y / B->UuPerTile, bShift);
	}
	if (bAutoTest) RunAutoTest(Dt);
}

void AAoEPlayerController::RunAutoTest(float Dt)
{
	AAoEBridgeActor* B = Bridge();
	if (!B || !B->bHaveState) return;
	AutoT += Dt;
	if (FParse::Param(FCommandLine::Get(), TEXT("AoEOrderTest")))
	{
		auto MeanDist = [&]() { float S = 0.f; int32 N = 0; for (const TPair<int32, FAoEVisual>& K : B->GetUnits()) if (K.Value.Dono == B->MyPlayer && B->GetSelected().Contains(K.Key)) { S += FVector2D::Distance(K.Value.To, OrderTile); ++N; } return N ? S / N : 0.f; };
		if (OrderStage == 0 && AutoT > AutoDelay)
		{
			TSet<int32> All;
			for (int32 Id : B->MyUnitIds()) All.Add(Id);
			B->SetSelected(All);
			float Best = 1e9f;
			for (const TPair<int32, FVector2D>& K : B->GetNodeTiles()) { const float D = FVector2D::Distance(K.Value, B->MyCentroidTiles); if (D > 12.f && D < Best) { Best = D; OrderNode = K.Key; OrderTile = K.Value; } }
			OrderDist0 = MeanDist();
			int32 T = 0; FString Kind;
			const bool bPick = B->PickTarget(OrderTile.X, OrderTile.Y, T, Kind);
			UE_LOG(LogTemp, Log, TEXT("AOE_ORDER pick=%d kind=%s id=%d (esperado no %d) distancia media inicial %.1f tiles"), bPick ? 1 : 0, *Kind, T, OrderNode, OrderDist0);
			ContextOrder(OrderTile.X, OrderTile.Y, false);
			OrderStage = 1; OrderT = 0.f;
		}
		else if (OrderStage == 1) { OrderT += Dt; if (OrderT > 20.f) { UE_LOG(LogTemp, Log, TEXT("AOE_ORDER distancia media final %.1f tiles (inicial %.1f)"), MeanDist(), OrderDist0); ConsoleCommand(TEXT("quit"), true); OrderStage = 2; } }
		return;
	}
	if (Shots.Num() > 0)
	{
		// tomadas dirigidas: posiciona a camera, espera 2 s (a malha e a luz assentam) e fotografa
		if (AutoT < AutoDelay) return;
		ShotT += Dt;
		AAoECameraPawn* Cam = Cast<AAoECameraPawn>(GetPawn());
		if (ShotIdx >= Shots.Num()) { if (ShotT > 3.f) ConsoleCommand(TEXT("quit"), true); return; }
		const FShot& S = Shots[ShotIdx];
		if (Cam && ShotT < Dt * 1.5f + 0.001f)
		{
			const float Uu = (float)B->UuPerTile;
			Cam->SetActorLocation(FVector(S.X * Uu, S.Y * Uu, B->GroundZ(S.X * Uu, S.Y * Uu)));
			Cam->Arm->TargetArmLength = S.Arm;
			Cam->Arm->SetRelativeRotation(FRotator(S.Pitch, S.Yaw, 0.f));
		}
		if (ShotT > 2.5f)
		{
			const FString Dir = ShotDir.IsEmpty() ? FPaths::ProjectSavedDir() : ShotDir;
			ConsoleCommand(FString::Printf(TEXT("HighResShot 1920x1080 filename=\"%s/%s.png\""), *Dir, *S.Name), true);
			++ShotIdx; ShotT = 0.f;
		}
		return;
	}
	auto Shot = [&](const TCHAR* Name)
	{
		const FString Dir = ShotDir.IsEmpty() ? FPaths::ProjectSavedDir() : ShotDir;
		ConsoleCommand(FString::Printf(TEXT("HighResShot 1920x1080 filename=\"%s/%s.png\""), *Dir, Name), true);
	};
	if (AutoStage == 0 && AutoT > AutoDelay) { Shot(TEXT("u0-caixas-1")); AutoStage = 1; }
	else if (AutoStage == 1 && AutoT > AutoDelay + 1.f)
	{
		TSet<int32> All;
		for (int32 Id : B->MyUnitIds()) All.Add(Id);
		B->SetSelected(All);
		AoEMove(B->MyCentroidTiles.X + 14.f, B->MyCentroidTiles.Y + 9.f);   // o mesmo caminho do clique direito
		AutoStage = 2;
	}
	else if (AutoStage == 2 && AutoT > AutoDelay + 6.f) { Shot(TEXT("u0-caixas-2")); AutoStage = 3; }
	else if (AutoStage == 3 && AutoT > AutoDelay + 9.f) { ConsoleCommand(TEXT("quit"), true); AutoStage = 4; }
}

bool AAoEPlayerController::GetDragRect(FVector2D& A, FVector2D& B) const
{
	if (!bDragging) return false;
	float MX = 0.f, MY = 0.f;
	if (!GetMousePosition(MX, MY)) return false;
	A = DragStart; B = FVector2D(MX, MY);
	return FVector2D::Distance(A, B) > 8.f;
}
