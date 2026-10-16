#include "AoETerreno.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/Texture2D.h"
#include "Engine/StaticMeshActor.h"
#include "Components/StaticMeshComponent.h"
#include "Misc/Base64.h"
#include "Algo/MinElement.h"
#include "Algo/MaxElement.h"

AAoETerreno::AAoETerreno()
{
	PrimaryActorTick.bCanEverTick = false;
	Malha = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Malha"));
	SetRootComponent(Malha);
}

static bool LerB64(const TSharedPtr<FJsonObject>& O, const TCHAR* Campo, TArray<uint8>& Out)
{
	FString S;
	return O->TryGetStringField(Campo, S) && FBase64::Decode(S, Out);
}

bool AAoETerreno::Montar(const TSharedPtr<FJsonObject>& Relevo, float TamanhoUu)
{
	if (!Relevo.IsValid()) return false;
	const int32 Amostras = (int32)Relevo->GetNumberField(TEXT("n"));
	if (Amostras < 3) return false;
	TArray<uint8> Alt, Gr, Te, Ar, Ro;
	if (!LerB64(Relevo, TEXT("altura"), Alt) || Alt.Num() != Amostras * Amostras * 2) return false;
	if (!LerB64(Relevo, TEXT("grama"), Gr) || !LerB64(Relevo, TEXT("terra"), Te) || !LerB64(Relevo, TEXT("areia"), Ar) || !LerB64(Relevo, TEXT("rocha"), Ro)) return false;
	if (Gr.Num() != Amostras * Amostras || Te.Num() != Gr.Num() || Ar.Num() != Gr.Num() || Ro.Num() != Gr.Num()) return false;
	const double Zero = Relevo->GetNumberField(TEXT("zero")), PorMetro = Relevo->GetNumberField(TEXT("porMetro")), ZScale = Relevo->GetNumberField(TEXT("zScale"));
	N = Amostras; Lado = TamanhoUu; Passo = Lado / (float)(N - 1);
	Z.SetNumUninitialized(N * N);
	for (int32 i = 0; i < N * N; ++i)
	{
		const uint16 V = (uint16)(Alt[i * 2] | (Alt[i * 2 + 1] << 8));   // uint16 little-endian
		Z[i] = (float)((V - Zero) / PorMetro * ZScale);
	}
	ConstruirPesos(Gr, Te, Ar, Ro);
	ConstruirMalha();
	ConstruirMar();
	return true;
}

float AAoETerreno::AlturaEm(float X, float Y) const
{
	if (N < 2) return 0.f;
	const float Fx = FMath::Clamp(X / Passo, 0.f, (float)(N - 1) - 0.001f), Fy = FMath::Clamp(Y / Passo, 0.f, (float)(N - 1) - 0.001f);
	const int32 I = (int32)Fx, J = (int32)Fy;
	const float Tx = Fx - I, Ty = Fy - J;
	const float A = Z[J * N + I], B = Z[J * N + I + 1], C = Z[(J + 1) * N + I], D = Z[(J + 1) * N + I + 1];
	return FMath::Lerp(FMath::Lerp(A, B, Tx), FMath::Lerp(C, D, Tx), Ty);
}

void AAoETerreno::ConstruirPesos(const TArray<uint8>& Grama, const TArray<uint8>& Terra, const TArray<uint8>& Areia, const TArray<uint8>& Rocha)
{
	// RGBA = grama, terra, areia, rocha, normalizados para somar 255 (o material mistura por esses pesos)
	Pesos = UTexture2D::CreateTransient(N, N, PF_B8G8R8A8);
	Pesos->SRGB = false;
	Pesos->Filter = TF_Bilinear;
	Pesos->AddressX = TA_Clamp; Pesos->AddressY = TA_Clamp;
	Pesos->NeverStream = true;
	FTexture2DMipMap& Mip = Pesos->GetPlatformData()->Mips[0];
	uint8* Dst = (uint8*)Mip.BulkData.Lock(LOCK_READ_WRITE);
	for (int32 i = 0; i < N * N; ++i)
	{
		float G = Grama[i], T = Terra[i], A = Areia[i], R = Rocha[i];
		float S = G + T + A + R;
		if (S < 1.f) { G = 255.f; S = 255.f; }
		const float K = 255.f / S;
		Dst[i * 4 + 0] = (uint8)FMath::Clamp(R * K, 0.f, 255.f);   // B (mapeado: B = rocha)
		Dst[i * 4 + 1] = (uint8)FMath::Clamp(A * K, 0.f, 255.f);   // G = areia
		Dst[i * 4 + 2] = (uint8)FMath::Clamp(T * K, 0.f, 255.f);   // R = terra
		Dst[i * 4 + 3] = (uint8)FMath::Clamp(G * K, 0.f, 255.f);   // A = grama
	}
	Mip.BulkData.Unlock();
	Pesos->UpdateResource();
}

void AAoETerreno::ConstruirMalha()
{
	// blocos de 72 x 72 quads (505 = 7 * 72 + 1); cada bloco e uma secao com colisao
	const int32 Bloco = 72;
	const int32 Quads = N - 1;
	const int32 Nb = FMath::DivideAndRoundUp(Quads, Bloco);
	int32 Sec = 0;
	Malha->bUseAsyncCooking = true;   // a colisao (49 blocos de ~10 mil triangulos) era preparada na thread do jogo: 15 s de tela parada
	const double T0 = FPlatformTime::Seconds();
	for (int32 By = 0; By < Nb; ++By)
		for (int32 Bx = 0; Bx < Nb; ++Bx)
		{
			const int32 X0 = Bx * Bloco, Y0 = By * Bloco, X1 = FMath::Min(X0 + Bloco, Quads), Y1 = FMath::Min(Y0 + Bloco, Quads);
			const int32 W = X1 - X0 + 1, H = Y1 - Y0 + 1;
			TArray<FVector> V; TArray<FVector> Nrm; TArray<FVector2D> UV; TArray<int32> Tri; TArray<FProcMeshTangent> Tan;
			V.Reserve(W * H); Nrm.Reserve(W * H); UV.Reserve(W * H); Tan.Reserve(W * H);
			for (int32 j = Y0; j <= Y1; ++j)
				for (int32 i = X0; i <= X1; ++i)
				{
					const float X = i * Passo, Y = j * Passo, Zv = Z[j * N + i];
					V.Add(FVector(X, Y, Zv));
					const float Zl = Z[j * N + FMath::Max(i - 1, 0)], Zr = Z[j * N + FMath::Min(i + 1, N - 1)];
					const float Zd = Z[FMath::Max(j - 1, 0) * N + i], Zu = Z[FMath::Min(j + 1, N - 1) * N + i];
					Nrm.Add(FVector(-(Zr - Zl) / (2.f * Passo), -(Zu - Zd) / (2.f * Passo), 1.f).GetSafeNormal());
					UV.Add(FVector2D(X / Lado, Y / Lado));
					Tan.Add(FProcMeshTangent(1.f, 0.f, 0.f));
				}
			for (int32 j = 0; j < H - 1; ++j)
				for (int32 i = 0; i < W - 1; ++i)
				{
					const int32 A = j * W + i, B = A + 1, C = A + W, D = C + 1;
					// UE: frente = sentido horario visto de cima (X para frente, Y para a direita)
					Tri.Add(A); Tri.Add(C); Tri.Add(B);
					Tri.Add(B); Tri.Add(C); Tri.Add(D);
				}
			Malha->CreateMeshSection(Sec, V, Tri, Nrm, UV, TArray<FColor>(), Tan, true);
			++Sec;
		}
	UE_LOG(LogTemp, Log, TEXT("AoE: malha criada em %.0f ms"), (FPlatformTime::Seconds() - T0) * 1000.0);
	Malha->SetCollisionObjectType(ECC_WorldStatic);
	Malha->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Malha->SetCollisionResponseToAllChannels(ECR_Block);
	Malha->bUseComplexAsSimpleCollision = true;
	Malha->SetCastShadow(true);
	UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Terreno/M_TerrenoRT.M_TerrenoRT"));
	if (Base)
	{
		Material = UMaterialInstanceDynamic::Create(Base, this);
		Material->SetTextureParameterValue(TEXT("Pesos"), Pesos);
		Material->SetScalarParameterValue(TEXT("LadoMapa"), Lado);
		for (int32 i = 0; i < Sec; ++i) Malha->SetMaterial(i, Material);
	}
	else UE_LOG(LogTemp, Warning, TEXT("AoE: sem /Game/Terreno/M_TerrenoRT (rode u3_material.py)"));
	UE_LOG(LogTemp, Log, TEXT("AoE: terreno em tempo de execucao: %d x %d amostras, %d blocos, passo %.1f uu, altura %.0f..%.0f"),
		N, N, Sec, Passo, *Algo::MinElement(Z), *Algo::MaxElement(Z));
}

void AAoETerreno::ConstruirMar()
{
	FActorSpawnParameters Sp;
	AStaticMeshActor* P = GetWorld()->SpawnActor<AStaticMeshActor>(FVector(Lado * 0.5f, Lado * 0.5f, -70.f), FRotator::ZeroRotator, Sp);
	if (!P) return;
	UStaticMeshComponent* C = P->GetStaticMeshComponent();
	C->SetMobility(EComponentMobility::Movable);
	C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")));
	if (UMaterialInterface* Mat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Terreno/M_Mar.M_Mar"))) C->SetMaterial(0, Mat);
	C->SetCastShadow(false);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	P->SetActorScale3D(FVector(Lado * 4.f / 100.f, Lado * 4.f / 100.f, 1.f));
	Mar = P;
}
