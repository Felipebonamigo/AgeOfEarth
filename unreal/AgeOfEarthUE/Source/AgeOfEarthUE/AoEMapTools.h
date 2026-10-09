#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "AoEMapTools.generated.h"

class ALandscape;
class UMaterialInterface;
class UWorld;

/**
 * Ferramentas de editor chamadas pelos scripts Python de unreal/scripts (o Python do editor nao expoe a importacao do
 * Landscape): importa o heightmap .r16 exportado por `npm run unreal:terrain` com as camadas de peso (grama, terra,
 * areia, rocha). So faz algo no editor; no jogo empacotado devolve nullptr.
 */
UCLASS()
class UAoEMapTools : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()
public:
	/**
	 * @param R16Path     heightmap.r16 (uint16 little-endian, Resolution x Resolution)
	 * @param Resolution  lado do heightmap (1009 = 16 componentes de 63 quads + 1)
	 * @param ScaleXY     uu por quad (terrain.json: landscape.scaleXY); ScaleZ idem (100)
	 * @param LayerNames  nomes das camadas (batem com o material), LayerPngs os PNG de 8 bits correspondentes
	 * @param LayerInfoDir pasta do conteudo onde criar os LayerInfo (ex.: /Game/Maps/U0_Layers)
	 */
	UFUNCTION(BlueprintCallable, Category = "AoE")
	static ALandscape* ImportLandscape(UWorld* World, const FString& R16Path, int32 Resolution, float ScaleXY, float ScaleZ,
		UMaterialInterface* Material, const TArray<FString>& LayerNames, const TArray<FString>& LayerPngs, const FString& LayerInfoDir);
};
