#include "AoEHud.h"

#include "AoEBridgeActor.h"
#include "AoEPlayerController.h"
#include "CanvasItem.h"
#include "Dom/JsonObject.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/Texture2D.h"
#include "EngineUtils.h"
#include "Fonts/CompositeFont.h"
#include "Fonts/FontMeasure.h"
#include "Framework/Application/SlateApplication.h"
#include "ImageUtils.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Rendering/SlateRenderer.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
	const FLinearColor Ouro(0.93f, 0.78f, 0.45f);
	const FLinearColor Pergaminho(0.96f, 0.92f, 0.82f);
	const FLinearColor Apagado(0.72f, 0.68f, 0.6f);
}

AAoEBridgeActor* AAoEHud::FindBridge()
{
	if (BridgeRef.IsValid()) return BridgeRef.Get();
	for (TActorIterator<AAoEBridgeActor> It(GetWorld()); It; ++It) { BridgeRef = *It; break; }
	return BridgeRef.Get();
}

void AAoEHud::LoadArt()
{
	bArtTried = true;
	const FString Dir = FPaths::Combine(FPaths::ProjectDir(), TEXT("Dados"), TEXT("hud"));
	IconTex = FImageUtils::ImportFileAsTexture2D(FPaths::Combine(Dir, TEXT("icones.png")));
	PanelTex = FImageUtils::ImportFileAsTexture2D(FPaths::Combine(Dir, TEXT("painel.png")));
	FString Txt;
	if (FFileHelper::LoadFileToString(Txt, *FPaths::Combine(Dir, TEXT("icones.json"))))
	{
		TSharedPtr<FJsonObject> Root;
		if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Txt), Root) && Root.IsValid())
			for (const TPair<FString, TSharedPtr<FJsonValue>>& KV : Root->Values)
			{
				const TArray<TSharedPtr<FJsonValue>>& A = KV.Value->AsArray();
				if (A.Num() == 4) IconUV.Add(KV.Key, FVector4f((float)A[0]->AsNumber(), (float)A[1]->AsNumber(), (float)A[2]->AsNumber(), (float)A[3]->AsNumber()));
			}
	}
	const FString Bold = FPaths::ConvertRelativePathToFull(FPaths::Combine(Dir, TEXT("Cinzel-700.ttf")));
	const FString Reg = FPaths::ConvertRelativePathToFull(FPaths::Combine(Dir, TEXT("Cinzel-400.ttf")));
	if (FPaths::FileExists(Bold)) FontBold = MakeShared<FCompositeFont>(FName(TEXT("CinzelBold")), Bold, EFontHinting::Default, EFontLoadingPolicy::LazyLoad);
	if (FontBold.IsValid())
	{
		RuntimeFont = NewObject<UFont>(this);
		RuntimeFont->FontCacheType = EFontCacheType::Runtime;
		RuntimeFont->CompositeFont = *FontBold;
		RuntimeFont->LegacyFontSize = 16;
	}
	if (FPaths::FileExists(Reg)) FontRegular = MakeShared<FCompositeFont>(FName(TEXT("CinzelRegular")), Reg, EFontHinting::Default, EFontLoadingPolicy::LazyLoad);
	UE_LOG(LogTemp, Log, TEXT("AoE HUD: icones %s (%d), painel %s, fonte %s"), IconTex ? TEXT("ok") : TEXT("FALTA"), IconUV.Num(), PanelTex ? TEXT("ok") : TEXT("FALTA"), FontBold.IsValid() ? TEXT("Cinzel") : TEXT("padrao"));
}

FSlateFontInfo AAoEHud::FontOf(int32 Size, bool bBold)
{
	TSharedPtr<const FCompositeFont> F = bBold ? FontBold : FontRegular;
	if (!F.IsValid()) F = FontBold.IsValid() ? FontBold : FontRegular;
	if (F.IsValid()) return FSlateFontInfo(F, (float)Size);
	return FSlateFontInfo(GEngine->GetMediumFont(), (float)Size);
}

FVector2D AAoEHud::Measure(const FString& S, int32 Size, bool bBold)
{
	if (FSlateApplication::IsInitialized())
		return FSlateApplication::Get().GetRenderer()->GetFontMeasureService()->Measure(S, FontOf(Size, bBold));
	return FVector2D(S.Len() * Size * 0.6f, Size);
}

void AAoEHud::Text(const FString& S, float X, float Y, int32 Size, const FLinearColor& C, bool bBold, bool bShadow)
{
	FCanvasTextItem T(FVector2D(X, Y), FText::FromString(S), FontOf(Size, bBold), C);
	T.Font = RuntimeFont ? RuntimeFont.Get() : GEngine->GetMediumFont();
	if (bShadow) { T.EnableShadow(FLinearColor(0.f, 0.f, 0.f, 0.85f), FVector2D(1.f, 1.5f)); }
	Canvas->DrawItem(T);
}

void AAoEHud::Panel(float X, float Y, float W, float H, float Alpha)
{
	if (!PanelTex) { DrawRect(FLinearColor(0.08f, 0.06f, 0.04f, 0.85f * Alpha), X, Y, W, H); return; }
	// 9-slice: o PNG tem 512x128 com borda e grega nos 24 px de cima; cantos fixos, miolo esticado
	const float TW = 512.f, TH = 128.f, Bx = 24.f, By = 26.f, Bb = 8.f;
	auto Piece = [&](float Dx, float Dy, float Dw, float Dh, float U0, float V0, float U1, float V1)
	{
		if (Dw <= 0.f || Dh <= 0.f) return;
		FCanvasTileItem T(FVector2D(Dx, Dy), PanelTex->GetResource(), FVector2D(Dw, Dh), FVector2D(U0 / TW, V0 / TH), FVector2D(U1 / TW, V1 / TH), FLinearColor(1.f, 1.f, 1.f, Alpha));
		T.BlendMode = SE_BLEND_Translucent;
		Canvas->DrawItem(T);
	};
	const float Top = FMath::Min(By, H * 0.5f), Bot = FMath::Min(Bb, H * 0.5f), Side = FMath::Min(Bx, W * 0.5f);
	// linha de cima (com a grega), meio, linha de baixo
	Piece(X, Y, Side, Top, 0, 0, Bx, By);
	Piece(X + Side, Y, W - 2 * Side, Top, Bx, 0, TW - Bx, By);
	Piece(X + W - Side, Y, Side, Top, TW - Bx, 0, TW, By);
	Piece(X, Y + Top, Side, H - Top - Bot, 0, By, Bx, TH - Bb);
	Piece(X + Side, Y + Top, W - 2 * Side, H - Top - Bot, Bx, By, TW - Bx, TH - Bb);
	Piece(X + W - Side, Y + Top, Side, H - Top - Bot, TW - Bx, By, TW, TH - Bb);
	Piece(X, Y + H - Bot, Side, Bot, 0, TH - Bb, Bx, TH);
	Piece(X + Side, Y + H - Bot, W - 2 * Side, Bot, Bx, TH - Bb, TW - Bx, TH);
	Piece(X + W - Side, Y + H - Bot, Side, Bot, TW - Bx, TH - Bb, TW, TH);
}

bool AAoEHud::Icon(const FString& Key, float X, float Y, float Size, const FLinearColor& Tint)
{
	const FVector4f* UV = IconUV.Find(Key);
	if (!UV || !IconTex) return false;
	FCanvasTileItem T(FVector2D(X, Y), IconTex->GetResource(), FVector2D(Size, Size), FVector2D(UV->X, UV->Y), FVector2D(UV->X + UV->Z, UV->Y + UV->W), Tint);
	T.BlendMode = SE_BLEND_Translucent;
	Canvas->DrawItem(T);
	return true;
}

void AAoEHud::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	if (!bArtTried) LoadArt();
	AAoEBridgeActor* B = FindBridge();
	if (!B || !B->bHaveState) return;
	const float Sx = Canvas->SizeX, Sy = Canvas->SizeY;
	const float K = FMath::Clamp(Sy / 1080.f, 0.75f, 2.f);   // escala da interface pela altura da tela
	AAoEPlayerController* PC = Cast<AAoEPlayerController>(GetOwningPlayerController());

	// ---- barra do topo: recursos | população | Era ----
	const float BarH = 58.f * K;
	Panel(0.f, 0.f, Sx, BarH);
	struct FRes { const TCHAR* Key; const TCHAR* Nome; };
	const FRes Res[] = { {TEXT("food"), TEXT("Comida")}, {TEXT("wood"), TEXT("Madeira")}, {TEXT("stone"), TEXT("Pedra")}, {TEXT("gold"), TEXT("Ouro")},
		{TEXT("oil"), TEXT("Petróleo")}, {TEXT("knowledge"), TEXT("Saber")}, {TEXT("favor"), TEXT("Favor")} };
	float X = 18.f * K;
	const float IconS = 40.f * K, Ty = 18.f * K;
	for (const FRes& R : Res)
	{
		const int32* V = B->Resources.Find(R.Key);
		if (!V) continue;
		if (FCString::Strcmp(R.Key, TEXT("oil")) == 0 && *V == 0) continue;
		const bool bIcon = Icon(FString(TEXT("res/")) + R.Key, X, (BarH - IconS) * 0.5f + 3.f * K, IconS);
		const float Tx = X + (bIcon ? IconS + 6.f * K : 0.f);
		const FString Num = FString::FromInt(*V);
		Text(bIcon ? Num : FString::Printf(TEXT("%s %s"), R.Nome, *Num), Tx, Ty, FMath::RoundToInt(17.f * K), Pergaminho);
		X = Tx + FMath::Max(70.f * K, (float)Measure(Num, FMath::RoundToInt(17.f * K)).X + 26.f * K);
	}
	const FString AgeName = B->AgeNames.IsValidIndex(B->Age) ? B->AgeNames[B->Age] : FString::Printf(TEXT("Era %d"), B->Age + 1);
	const int32 TitleSize = FMath::RoundToInt(18.f * K);
	const float AgeW = (float)Measure(AgeName, TitleSize).X;
	const float AgeX = Sx - AgeW - 24.f * K;
	Icon(FString::Printf(TEXT("age/%d"), FMath::Clamp(B->Age, 0, 7)), AgeX - IconS - 8.f * K, (BarH - IconS) * 0.5f + 3.f * K, IconS);
	Text(AgeName, AgeX, Ty, TitleSize, Ouro);
	const FString Pop = FString::Printf(TEXT("%d / %d"), B->Pop, B->PopCap);
	const float PopX = AgeX - IconS - 40.f * K - (float)Measure(Pop, FMath::RoundToInt(17.f * K)).X;
	Icon(TEXT("unit/villager"), PopX - IconS - 4.f * K, (BarH - IconS) * 0.5f + 3.f * K, IconS);
	Text(Pop, PopX, Ty, FMath::RoundToInt(17.f * K), B->Pop >= B->PopCap ? FLinearColor(1.f, 0.45f, 0.35f) : Pergaminho);
	if (B->bGameOver) { const FString D = TEXT("Derrota"); Text(D, (Sx - (float)Measure(D, 44).X) * 0.5f, Sy * 0.3f, 44, FLinearColor(0.9f, 0.25f, 0.2f)); }

	// ---- caixa de seleção ----
	FVector2D A, Bp;
	if (PC && PC->GetDragRect(A, Bp))
	{
		const float X0 = FMath::Min(A.X, Bp.X), Y0 = FMath::Min(A.Y, Bp.Y), Wd = FMath::Abs(A.X - Bp.X), Ht = FMath::Abs(A.Y - Bp.Y);
		DrawRect(FLinearColor(0.95f, 0.85f, 0.55f, 0.08f), X0, Y0, Wd, Ht);
		const FLinearColor L(0.95f, 0.82f, 0.5f, 0.9f);
		DrawLine(X0, Y0, X0 + Wd, Y0, L); DrawLine(X0, Y0 + Ht, X0 + Wd, Y0 + Ht, L); DrawLine(X0, Y0, X0, Y0 + Ht, L); DrawLine(X0 + Wd, Y0, X0 + Wd, Y0 + Ht, L);
	}
	// ---- barras de vida no mundo (seleção) ----
	for (const int32 Id : B->GetSelected())
	{
		const FAoEVisual* V = B->GetUnits().Find(Id);
		if (!V || !V->Actor.IsValid()) continue;
		const FVector2D S = FVector2D(Project(V->GroundPoint + FVector(0, 0, V->MeshHeight + 35.f)));
		if (S.X < 0 || S.Y < 0 || S.X > Sx || S.Y > Sy) continue;
		const float Wd = 34.f * K, Hd = 5.f * K, F = FMath::Clamp(V->Hp01, 0.f, 1.f);
		DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.75f), S.X - Wd * 0.5f - 1.f, S.Y - 1.f, Wd + 2.f, Hd + 2.f);
		const FLinearColor Cor = F > 0.5f ? FLinearColor(0.35f, 0.8f, 0.3f) : (F > 0.25f ? FLinearColor(0.9f, 0.75f, 0.2f) : FLinearColor(0.9f, 0.25f, 0.15f));
		DrawRect(Cor, S.X - Wd * 0.5f, S.Y, Wd * F, Hd);
	}

	// ---- painel de baixo: seleção de unidades ou edifício ----
	const float PanW = FMath::Min(760.f * K, Sx - 40.f), PanH = 150.f * K, PanX = 20.f * K, PanY = Sy - PanH - 14.f * K;
	const int32 Small = FMath::RoundToInt(13.f * K);
	if (B->SelBuilding != 0)
	{
		Panel(PanX, PanY, PanW, PanH);
		const FString* Nm = B->BuildingNames.Find(B->SelBuildingType);
		Icon(TEXT("bld/") + B->SelBuildingType, PanX + 18.f * K, PanY + 34.f * K, 96.f * K);
		Text(Nm ? *Nm : B->SelBuildingType, PanX + 126.f * K, PanY + 32.f * K, TitleSize, Ouro);
		const TArray<FString>* Tr = B->BuildingTrains.Find(B->SelBuildingType);
		static const TCHAR* Keys[6] = { TEXT("Z"), TEXT("X"), TEXT("C"), TEXT("V"), TEXT("N"), TEXT("M") };
		if (Tr && Tr->Num() > 0)
			for (int32 i = 0; i < 6 && i < Tr->Num(); ++i)
			{
				const float Bx = PanX + 126.f * K + i * 72.f * K, By = PanY + 64.f * K, Bs = 60.f * K;
				DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.45f), Bx, By, Bs, Bs);
				if (!Icon(TEXT("unit/") + (*Tr)[i], Bx + 2.f, By + 2.f, Bs - 4.f)) { const FString* Un = B->UnitNames.Find((*Tr)[i]); Text(Un ? *Un : (*Tr)[i], Bx + 4.f, By + 20.f * K, Small, Pergaminho, false); }
				Text(Keys[i], Bx + Bs - 16.f * K, By + Bs - 20.f * K, Small, Ouro);
			}
		else Text(TEXT("Este edifício não treina unidades"), PanX + 126.f * K, PanY + 70.f * K, Small, Apagado, false);
	}
	else if (B->GetSelected().Num() > 0)
	{
		Panel(PanX, PanY, PanW, PanH);
		// agrupa por tipo: retrato, quantidade e vida média
		TMap<FString, TPair<int32, float>> Tipos;
		for (const int32 Id : B->GetSelected()) if (const FAoEVisual* V = B->GetUnits().Find(Id)) { TPair<int32, float>& T = Tipos.FindOrAdd(V->Type); T.Key++; T.Value += V->Hp01; }
		Text(FString::Printf(TEXT("%d unidade%s"), B->GetSelected().Num(), B->GetSelected().Num() > 1 ? TEXT("s") : TEXT("")), PanX + 22.f * K, PanY + 30.f * K, Small, Ouro);
		int32 i = 0;
		for (const TPair<FString, TPair<int32, float>>& T : Tipos)
		{
			if (i >= 9) break;
			const float Cx = PanX + 22.f * K + i * 80.f * K, Cy = PanY + 52.f * K, Cs = 68.f * K;
			DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.45f), Cx, Cy, Cs, Cs);
			if (!Icon(TEXT("unit/") + T.Key, Cx + 2.f, Cy + 2.f, Cs - 4.f)) { const FString* Un = B->UnitNames.Find(T.Key); Text(Un ? *Un : T.Key, Cx + 4.f, Cy + 24.f * K, Small, Pergaminho, false); }
			if (T.Value.Key > 1) Text(FString::Printf(TEXT("%d"), T.Value.Key), Cx + 4.f * K, Cy + 2.f * K, Small, Pergaminho);
			const float F = T.Value.Value / FMath::Max(1, T.Value.Key);
			DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.8f), Cx, Cy + Cs + 3.f * K, Cs, 5.f * K);
			DrawRect(F > 0.5f ? FLinearColor(0.35f, 0.8f, 0.3f) : FLinearColor(0.9f, 0.35f, 0.2f), Cx, Cy + Cs + 3.f * K, Cs * F, 5.f * K);
			++i;
		}
	}
	// menu de construção: ícones numerados acima do painel
	if (PC && PC->IsBuildMenuOpen())
	{
		const int32 N = PC->BuildList().Num();
		const float Bs = 64.f * K, Gap = 8.f * K, W = N * (Bs + Gap) + 28.f * K, H = Bs + 56.f * K;
		const float X0 = PanX, Y0 = PanY - H - 8.f * K;
		Panel(X0, Y0, W, H);
		Text(TEXT("Construir"), X0 + 16.f * K, Y0 + 28.f * K, Small, Ouro);
		for (int32 j = 0; j < N; ++j)
		{
			const float Bx = X0 + 14.f * K + j * (Bs + Gap), By = Y0 + 46.f * K;
			DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.45f), Bx, By, Bs, Bs);
			if (!Icon(TEXT("bld/") + PC->BuildList()[j], Bx + 2.f, By + 2.f, Bs - 4.f)) { const FString* Nm = B->BuildingNames.Find(PC->BuildList()[j]); Text(Nm ? *Nm : PC->BuildList()[j], Bx + 3.f, By + 22.f * K, Small, Pergaminho, false); }
			Text(FString::FromInt(j + 1), Bx + 4.f * K, By + 2.f * K, Small, Ouro);
		}
	}
	// avisos de modo e dicas
	auto Centro = [&](const FString& S, float Y, const FLinearColor& C) { const int32 Sz = FMath::RoundToInt(16.f * K); Text(S, (Sx - (float)Measure(S, Sz).X) * 0.5f, Y, Sz, C); };
	if (PC && !PC->PendingBuild().IsEmpty())
	{
		const FString* Nm = B->BuildingNames.Find(PC->PendingBuild());
		Centro(FString::Printf(TEXT("Posicionar %s — clique no chão · Shift: vários · Esc: cancelar"), Nm ? **Nm : *PC->PendingBuild()), BarH + 16.f * K, Pergaminho);
	}
	if (PC && PC->IsAttackMoveArmed()) Centro(TEXT("Atacar-mover — clique no destino · Esc: cancelar"), BarH + 16.f * K, FLinearColor(1.f, 0.6f, 0.4f));
	const FString Dica = B->SelBuilding != 0 ? TEXT("Z X C V N M: treinar") : (B->GetSelected().Num() > 0
		? TEXT("Clique direito: mover, atacar, coletar · A: atacar-mover · S: parar · B: construir · Ctrl+1..9: grupo")
		: TEXT("Arraste para selecionar · Q: todas as unidades · WASD: câmera · Roda: zoom"));
	const float DicaW = (float)Measure(Dica, Small, false).X;
	DrawRect(FLinearColor(0.02f, 0.015f, 0.01f, 0.55f), Sx - DicaW - 32.f * K, Sy - 32.f * K, DicaW + 24.f * K, 26.f * K);
	Text(Dica, Sx - DicaW - 20.f * K, Sy - 29.f * K, Small, Pergaminho, false);
}
