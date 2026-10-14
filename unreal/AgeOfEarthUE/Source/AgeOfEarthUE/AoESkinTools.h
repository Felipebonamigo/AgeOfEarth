#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "AoESkinTools.generated.h"

class UStaticMesh;
class USkeletalMesh;
class UAnimationAsset;
class USkeleton;

/**
 * Ferramenta de editor chamada pelos scripts Python (unreal/scripts/u1_esqueletos.py): transforma um humanoide estatico do
 * Meshy num SkeletalMesh pendurado no esqueleto do modelo de referencia (o Manny do Unreal), para que as animacoes dele
 * (ocioso, andar, golpe, morte) funcionem na malha. O Meshy gratuito nao entrega rig; os pesos de pele sao calculados aqui,
 * por proximidade aos segmentos dos ossos. So faz algo no editor; no jogo empacotado devolve nullptr.
 */
UCLASS()
class UAoESkinTools : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()
public:
	/**
	 * @param Source     malha estatica do personagem (em pe, ~simetrica, pose A)
	 * @param Template   SkeletalMesh de referencia (SKM_Manny_Simple): fornece o esqueleto e a pose
	 * @param PackagePath caminho do novo asset (ex.: /Game/Unidades/SK_Hoplita)
	 * @param YawDeg     giro em torno de Z aplicado antes de pesar: leva a frente da malha ao +Y do Manny
	 * @param Suavidade  expoente da queda do peso com a distancia (maior = pele mais rigida)
	 */
	UFUNCTION(BlueprintCallable, Category = "AoE")
	static USkeletalMesh* BuildSkinnedFromStatic(UStaticMesh* Source, USkeletalMesh* Template, const FString& PackagePath, float YawDeg, float Suavidade);

	/**
	 * Versao geral para qualquer esqueleto (humano, cavalo, raposa, dragao...). FitMode 0 = ajusta a ALTURA da malha ao esqueleto
	 * (osso mais alto + Margem cm), 1 = ajusta o COMPRIMENTO em Y (de ponta a ponta dos ossos + Margem). A malha vai para o centro
	 * XY dos ossos com os pes no menor Z. Margem negativa e valida.
	 */
	UFUNCTION(BlueprintCallable, Category = "AoE")
	static USkeletalMesh* BuildSkinnedGeneric(UStaticMesh* Source, USkeletalMesh* Template, const FString& PackagePath, float YawDeg, float Suavidade, int32 FitMode, float Margem);

	/** Religa uma animacao ao esqueleto (as do modelo Third Person ficaram com o USkeleton nulo e o cook cai). So no editor. */
	UFUNCTION(BlueprintCallable, Category = "AoE")
	static bool SetAnimSkeleton(UAnimationAsset* Anim, USkeleton* Skeleton);
};
