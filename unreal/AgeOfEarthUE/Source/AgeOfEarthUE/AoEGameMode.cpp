#include "AoEGameMode.h"

#include "AoEBridgeActor.h"
#include "AoEPlayerController.h"
#include "AoEHud.h"
#include "Engine/World.h"

AAoEGameMode::AAoEGameMode()
{
	PlayerControllerClass = AAoEPlayerController::StaticClass();
	DefaultPawnClass = AAoECameraPawn::StaticClass();
	HUDClass = AAoEHud::StaticClass();
}

void AAoEGameMode::StartPlay()
{
	// o ator da ponte nasce antes de o jogo comecar para ja estar ouvindo quando o primeiro `state` chegar
	GetWorld()->SpawnActor<AAoEBridgeActor>(FVector::ZeroVector, FRotator::ZeroRotator);
	Super::StartPlay();
}
