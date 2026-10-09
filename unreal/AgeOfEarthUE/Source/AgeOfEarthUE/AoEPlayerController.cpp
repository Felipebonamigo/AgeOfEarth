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
	if (WasInputKeyJustPressed(EKeys::LeftMouseButton))
	{
		FHitResult Hit;
		GetHitResultUnderCursor(ECC_Visibility, false, Hit);
		int32 Id = 0, Dono = -1;
		TSet<int32> Sel = IsInputKeyDown(EKeys::LeftShift) ? B->GetSelected() : TSet<int32>();
		if (Hit.GetActor() && B->UnitIdOf(Hit.GetActor(), Id, Dono) && Dono == B->MyPlayer) Sel.Add(Id);
		B->SetSelected(Sel);
	}
	// ordem de movimento
	if (WasInputKeyJustPressed(EKeys::RightMouseButton))
	{
		FHitResult Hit;
		if (GetHitResultUnderCursor(ECC_Visibility, false, Hit))
			AoEMove(Hit.ImpactPoint.X / B->UuPerTile, Hit.ImpactPoint.Y / B->UuPerTile);
	}
	if (bAutoTest) RunAutoTest(Dt);
}

void AAoEPlayerController::RunAutoTest(float Dt)
{
	AAoEBridgeActor* B = Bridge();
	if (!B || !B->bHaveState) return;
	AutoT += Dt;
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
