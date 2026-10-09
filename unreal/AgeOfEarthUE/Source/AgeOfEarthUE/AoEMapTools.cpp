#include "AoEMapTools.h"

#include "Engine/World.h"
#include "Materials/MaterialInterface.h"

#if WITH_EDITOR
#include "Landscape.h"
#include "LandscapeProxy.h"
#include "LandscapeInfo.h"
#include "LandscapeLayerInfoObject.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Misc/FileHelper.h"
#include "Modules/ModuleManager.h"
#include "UObject/Package.h"
#endif

ALandscape* UAoEMapTools::ImportLandscape(UWorld* World, const FString& R16Path, int32 Resolution, float ScaleXY, float ScaleZ,
	UMaterialInterface* Material, const TArray<FString>& LayerNames, const TArray<FString>& LayerPngs, const FString& LayerInfoDir)
{
#if WITH_EDITOR
	if (!World) return nullptr;
	TArray<uint8> Raw;
	if (!FFileHelper::LoadFileToArray(Raw, *R16Path) || Raw.Num() != Resolution * Resolution * 2)
	{
		UE_LOG(LogTemp, Error, TEXT("AoE: heightmap invalido (%s, %d bytes, esperado %d)"), *R16Path, Raw.Num(), Resolution * Resolution * 2);
		return nullptr;
	}
	TArray<uint16> Height;
	Height.SetNumUninitialized(Resolution * Resolution);
	FMemory::Memcpy(Height.GetData(), Raw.GetData(), Raw.Num());

	IImageWrapperModule& IW = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
	TArray<FLandscapeImportLayerInfo> Layers;
	for (int32 i = 0; i < LayerNames.Num() && i < LayerPngs.Num(); ++i)
	{
		FLandscapeImportLayerInfo Info{FName(*LayerNames[i])};
		TArray<uint8> Png;
		TSharedPtr<IImageWrapper> Wrap = IW.CreateImageWrapper(EImageFormat::PNG);
		TArray64<uint8> Gray;
		if (FFileHelper::LoadFileToArray(Png, *LayerPngs[i]) && Wrap->SetCompressed(Png.GetData(), Png.Num()) && Wrap->GetRaw(ERGBFormat::Gray, 8, Gray)
			&& Wrap->GetWidth() == Resolution && Wrap->GetHeight() == Resolution)
		{
			Info.LayerData.SetNumUninitialized(Resolution * Resolution);
			FMemory::Memcpy(Info.LayerData.GetData(), Gray.GetData(), Resolution * Resolution);
		}
		else
		{
			UE_LOG(LogTemp, Error, TEXT("AoE: camada %s invalida (%s)"), *LayerNames[i], *LayerPngs[i]);
			return nullptr;
		}
		const FString PkgName = FString::Printf(TEXT("%s/%s_LayerInfo"), *LayerInfoDir, *LayerNames[i]);
		UPackage* Pkg = CreatePackage(*PkgName);
		ULandscapeLayerInfoObject* LI = NewObject<ULandscapeLayerInfoObject>(Pkg, FName(*FPackageName::GetShortName(PkgName)), RF_Public | RF_Standalone | RF_Transactional);
		LI->SetLayerName(FName(*LayerNames[i]), false);
		FAssetRegistryModule::AssetCreated(LI);
		Pkg->MarkPackageDirty();
		Info.LayerInfo = LI;
		Layers.Add(MoveTemp(Info));
	}

	const FGuid Guid = FGuid::NewGuid();
	TMap<FGuid, TArray<uint16>> HeightData;
	HeightData.Add(FGuid(), MoveTemp(Height));   // sem edit layers: a chave é a camada padrão (GUID zero)
	TMap<FGuid, TArray<FLandscapeImportLayerInfo>> LayerData;
	LayerData.Add(FGuid(), MoveTemp(Layers));

	ALandscape* L = World->SpawnActor<ALandscape>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!L) return nullptr;
	L->SetActorRelativeScale3D(FVector(ScaleXY, ScaleXY, ScaleZ));
	if (Material) L->LandscapeMaterial = Material;
	L->Import(Guid, 0, 0, Resolution - 1, Resolution - 1, 1, 63, HeightData, nullptr, LayerData, ELandscapeImportAlphamapType::Additive, TArrayView<const FLandscapeLayer>());
	if (ULandscapeInfo* LInfo = L->GetLandscapeInfo()) LInfo->UpdateLayerInfoMap(L);
	return L;
#else
	return nullptr;
#endif
}
