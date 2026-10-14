#include "AoEHud.h"

#include "AoEBridgeActor.h"
#include "AoEPlayerController.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "EngineUtils.h"
#include "CanvasItem.h"

void AAoEHud::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	UWorld* W = GetWorld();
	AAoEBridgeActor* B = nullptr;
	for (TActorIterator<AAoEBridgeActor> It(W); It; ++It) { B = *It; break; }
	if (!B || !B->bHaveState) return;
	UFont* Font = GEngine->GetMediumFont();
	const float Sx = Canvas->SizeX;
	// barra do topo
	DrawRect(FLinearColor(0.02f, 0.02f, 0.03f, 0.72f), 0.f, 0.f, Sx, 34.f);
	DrawRect(FLinearColor(0.72f, 0.58f, 0.25f, 0.9f), 0.f, 34.f, Sx, 2.f);
	struct FRes { const TCHAR* Key; const TCHAR* Name; FLinearColor Color; };
	const FRes Res[] = { {TEXT("food"), TEXT("Comida"), FLinearColor(0.85f, 0.45f, 0.2f)}, {TEXT("wood"), TEXT("Madeira"), FLinearColor(0.55f, 0.75f, 0.35f)},
		{TEXT("stone"), TEXT("Pedra"), FLinearColor(0.7f, 0.7f, 0.75f)}, {TEXT("gold"), TEXT("Ouro"), FLinearColor(0.95f, 0.8f, 0.25f)},
		{TEXT("oil"), TEXT("Petroleo"), FLinearColor(0.5f, 0.5f, 0.55f)}, {TEXT("knowledge"), TEXT("Saber"), FLinearColor(0.45f, 0.7f, 0.95f)}, {TEXT("favor"), TEXT("Favor"), FLinearColor(0.85f, 0.55f, 0.95f)} };
	float X = 14.f;
	for (const FRes& R : Res)
	{
		const int32* V = B->Resources.Find(R.Key);
		if (!V) continue;
		if (FCString::Strcmp(R.Key, TEXT("oil")) == 0 && *V == 0) continue;
		DrawText(FString::Printf(TEXT("%s %d"), R.Name, *V), R.Color, X, 8.f, Font, 1.0f);
		X += 118.f;
	}
	const FString AgeName = B->AgeNames.IsValidIndex(B->Age) ? B->AgeNames[B->Age] : FString::Printf(TEXT("Era %d"), B->Age + 1);
	DrawText(FString::Printf(TEXT("Populacao %d/%d"), B->Pop, B->PopCap), FLinearColor::White, Sx - 420.f, 8.f, Font, 1.0f);
	DrawText(AgeName, FLinearColor(0.95f, 0.85f, 0.5f), Sx - 220.f, 8.f, Font, 1.0f);
	if (B->bGameOver) DrawText(TEXT("DERROTA"), FLinearColor::Red, Sx * 0.5f - 40.f, 60.f, Font, 1.6f);

	AAoEPlayerController* PC = Cast<AAoEPlayerController>(GetOwningPlayerController());
	// caixa de selecao
	FVector2D A, Bp;
	if (PC && PC->GetDragRect(A, Bp))
	{
		const float X0 = FMath::Min(A.X, Bp.X), Y0 = FMath::Min(A.Y, Bp.Y), Wd = FMath::Abs(A.X - Bp.X), Ht = FMath::Abs(A.Y - Bp.Y);
		DrawRect(FLinearColor(0.3f, 0.9f, 0.4f, 0.12f), X0, Y0, Wd, Ht);
		DrawLine(X0, Y0, X0 + Wd, Y0, FLinearColor(0.4f, 1.f, 0.5f)); DrawLine(X0, Y0 + Ht, X0 + Wd, Y0 + Ht, FLinearColor(0.4f, 1.f, 0.5f));
		DrawLine(X0, Y0, X0, Y0 + Ht, FLinearColor(0.4f, 1.f, 0.5f)); DrawLine(X0 + Wd, Y0, X0 + Wd, Y0 + Ht, FLinearColor(0.4f, 1.f, 0.5f));
	}
	// barras de vida das unidades selecionadas e das que estao em combate (as nossas ou inimigas sob o cursor ficam para o U2c)
	for (const int32 Id : B->GetSelected())
	{
		const FAoEVisual* V = B->GetUnits().Find(Id);
		if (!V || !V->Actor.IsValid()) continue;
		FVector P = V->Actor->GetActorLocation() + FVector(0, 0, V->MeshHeight + 30.f);
		const FVector2D S = FVector2D(Project(P));
		if (S.X < 0 || S.Y < 0 || S.X > Sx || S.Y > Canvas->SizeY) continue;
		const float Wd = 30.f;
		DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.7f), S.X - Wd * 0.5f - 1.f, S.Y - 1.f, Wd + 2.f, 6.f);
		const float F = FMath::Clamp(V->Hp01, 0.f, 1.f);
		DrawRect(FLinearColor(1.f - F, F, 0.1f, 1.f), S.X - Wd * 0.5f, S.Y, Wd * F, 4.f);
	}
	// painel da selecao
	if (B->GetSelected().Num() > 0)
		DrawText(FString::Printf(TEXT("%d selecionada(s)  |  clique dir: mover/atacar/coletar  |  A+clique: atacar-mover  |  S: parar  |  Ctrl+1..9: grupo"), B->GetSelected().Num()), FLinearColor(0.9f, 0.9f, 0.9f), 14.f, Canvas->SizeY - 28.f, Font, 1.0f);
	else
		DrawText(TEXT("arraste para selecionar  |  Q: todas as unidades  |  WASD/setas: camera  |  roda: zoom"), FLinearColor(0.7f, 0.7f, 0.7f), 14.f, Canvas->SizeY - 28.f, Font, 1.0f);
	// painel de comandos: treino do edificio selecionado, menu de construcao
	float Py = Canvas->SizeY - 60.f;
	if (B->SelBuilding != 0)
	{
		const FString* Nm = B->BuildingNames.Find(B->SelBuildingType);
		DrawText(FString::Printf(TEXT("[%s]"), Nm ? **Nm : *B->SelBuildingType), FLinearColor(0.95f, 0.85f, 0.5f), 14.f, Py - 22.f, Font, 1.0f);
		const TArray<FString>* Tr = B->BuildingTrains.Find(B->SelBuildingType);
		static const TCHAR* Keys[6] = { TEXT("Z"), TEXT("X"), TEXT("C"), TEXT("V"), TEXT("N"), TEXT("M") };
		FString Linha;
		if (Tr) for (int32 i = 0; i < 6 && i < Tr->Num(); ++i) { const FString* Un = B->UnitNames.Find((*Tr)[i]); Linha += FString::Printf(TEXT("%s treinar %s   "), Keys[i], Un ? **Un : *(*Tr)[i]); }
		DrawText(Linha.IsEmpty() ? TEXT("(este edificio nao treina)") : *Linha, FLinearColor::White, 14.f, Py, Font, 1.0f);
	}
	if (PC && PC->IsBuildMenuOpen())
	{
		FString Linha = TEXT("CONSTRUIR:  ");
		for (int32 i = 0; i < PC->BuildList().Num(); ++i) { const FString* Nm = B->BuildingNames.Find(PC->BuildList()[i]); Linha += FString::Printf(TEXT("%d %s   "), i + 1, Nm ? **Nm : *PC->BuildList()[i]); }
		DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.6f), 8.f, Py - 4.f, Canvas->SizeX - 16.f, 26.f);
		DrawText(Linha, FLinearColor(0.6f, 0.95f, 0.6f), 14.f, Py, Font, 1.0f);
	}
	if (PC && !PC->PendingBuild().IsEmpty()) DrawText(FString::Printf(TEXT("Posicionar %s: clique no chao (Shift = varias, Esc cancela)"), *PC->PendingBuild()), FLinearColor(0.6f, 0.95f, 0.6f), Sx * 0.5f - 230.f, 76.f, Font, 1.1f);
	if (PC && PC->IsAttackMoveArmed()) DrawText(TEXT("ATACAR-MOVER: clique no destino (Esc cancela)"), FLinearColor(1.f, 0.5f, 0.3f), Sx * 0.5f - 200.f, 50.f, Font, 1.2f);
}
