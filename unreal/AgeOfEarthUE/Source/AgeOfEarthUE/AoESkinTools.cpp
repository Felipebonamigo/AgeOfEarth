#include "AoESkinTools.h"

#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"

#if WITH_EDITOR
#include "Animation/Skeleton.h"
#include "Animation/AnimationAsset.h"
#include "ReferenceSkeleton.h"
#include "MeshDescription.h"
#include "StaticMeshAttributes.h"
#include "SkeletalMeshAttributes.h"
#include "BoneWeights.h"
#include "Misc/PackageName.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "UObject/Package.h"
#endif

USkeletalMesh* UAoESkinTools::BuildSkinnedFromStatic(UStaticMesh* Source, USkeletalMesh* Template, const FString& PackagePath, float YawDeg, float Suavidade)
{
#if WITH_EDITOR
	if (!Source || !Template) return nullptr;
	const FMeshDescription* SD = Source->GetMeshDescription(0);
	if (!SD) { UE_LOG(LogTemp, Error, TEXT("AoE: malha estatica sem MeshDescription: %s"), *Source->GetName()); return nullptr; }
	FStaticMeshConstAttributes SA(*SD);
	TVertexAttributesConstRef<FVector3f> SPos = SA.GetVertexPositions();
	TVertexInstanceAttributesConstRef<FVector3f> SNrm = SA.GetVertexInstanceNormals();
	TVertexInstanceAttributesConstRef<FVector2f> SUV = SA.GetVertexInstanceUVs();
	TPolygonGroupAttributesConstRef<FName> SSlots = SA.GetPolygonGroupMaterialSlotNames();

	// ---- esqueleto de referencia: posicao de cada osso no espaco do componente --------------------------------------
	const FReferenceSkeleton& Ref = Template->GetRefSkeleton();
	const int32 NB = Ref.GetRawBoneNum();
	TArray<FTransform> Comp;
	Comp.SetNum(NB);
	for (int32 i = 0; i < NB; ++i)
	{
		const int32 P = Ref.GetParentIndex(i);
		Comp[i] = P >= 0 ? Ref.GetRawRefBonePose()[i] * Comp[P] : Ref.GetRawRefBonePose()[i];
	}
	auto Util = [&](int32 I)
	{
		const FString N = Ref.GetBoneName(I).ToString().ToLower();
		return !(N.Contains(TEXT("twist")) || N.Contains(TEXT("corrective")) || N.Contains(TEXT("ik_")) || N.Contains(TEXT("interaction"))
			|| N.Contains(TEXT("weapon")) || N.Contains(TEXT("cam")) || N.Equals(TEXT("root")) || N.Contains(TEXT("_fk")));
	};
	// altura do Manny: do pe a ponta da cabeca (osso mais alto + 24 cm)
	float ManTop = 0.f, ManBottom = 1e9f;
	for (int32 i = 0; i < NB; ++i)
	{
		if (!Util(i)) continue;
		ManTop = FMath::Max(ManTop, (float)Comp[i].GetLocation().Z);
		ManBottom = FMath::Min(ManBottom, (float)Comp[i].GetLocation().Z);
	}
	const float ManHeight = (ManTop + 24.f) - FMath::Min(0.f, ManBottom);
	struct FSeg { FVector A, B; int32 Bone; };
	TArray<FSeg> Segs;
	TArray<int32> Owners;
	for (int32 i = 0; i < NB; ++i)
	{
		const int32 P = Ref.GetParentIndex(i);
		if (P < 0 || !Util(i) || !Util(P)) continue;
		Segs.Add({ Comp[P].GetLocation(), Comp[i].GetLocation(), P });   // o trecho pai->filho deforma com o PAI
		Owners.AddUnique(P);
	}
	UE_LOG(LogTemp, Log, TEXT("AoE: esqueleto %s: %d ossos, %d segmentos, altura %.1f cm (topo %.1f)"), *Template->GetName(), NB, Segs.Num(), ManHeight, ManTop);

	// ---- alinhar a malha ao Manny --------------------------------------------------------------------------------
	const FQuat Rot = FQuat(FVector::UpVector, FMath::DegreesToRadians(YawDeg));
	FBox Box(ForceInit);
	for (const FVertexID V : SD->Vertices().GetElementIDs()) Box += Rot.RotateVector(FVector(SPos[V]));
	const float H = Box.Max.Z - Box.Min.Z;
	const float Scale = ManHeight / FMath::Max(1.f, H);
	const FVector Ctr((Box.Min.X + Box.Max.X) * 0.5, (Box.Min.Y + Box.Max.Y) * 0.5, Box.Min.Z);
	auto ToManny = [&](const FVector3f& P) { return (Rot.RotateVector(FVector(P)) - Ctr) * Scale; };

	// ---- nova descricao de malha ----------------------------------------------------------------------------------
	FMeshDescription ND;
	FSkeletalMeshAttributes NA(ND);
	NA.Register();
	for (int32 i = 0; i < NB; ++i)
	{
		const FBoneID B = NA.CreateBone();
		NA.GetBoneNames()[B] = Ref.GetBoneName(i);
		NA.GetBoneParentIndices()[B] = Ref.GetParentIndex(i);
		NA.GetBonePoses()[B] = Ref.GetRawRefBonePose()[i];
	}
	TVertexAttributesRef<FVector3f> NPos = NA.GetVertexPositions();
	TVertexInstanceAttributesRef<FVector3f> NNrm = NA.GetVertexInstanceNormals();
	TVertexInstanceAttributesRef<FVector3f> NTan = NA.GetVertexInstanceTangents();
	TVertexInstanceAttributesRef<float> NSgn = NA.GetVertexInstanceBinormalSigns();
	TVertexInstanceAttributesRef<FVector2f> NUV = NA.GetVertexInstanceUVs();
	TPolygonGroupAttributesRef<FName> NSlots = NA.GetPolygonGroupMaterialSlotNames();
	NUV.SetNumChannels(1);
	FSkinWeightsVertexAttributesRef NSW = NA.GetVertexSkinWeights();

	TMap<FVertexID, FVertexID> VMap;
	for (const FVertexID V : SD->Vertices().GetElementIDs())
	{
		const FVector P = ToManny(SPos[V]);
		const FVertexID NV = ND.CreateVertex();
		NPos[NV] = FVector3f(P);
		VMap.Add(V, NV);
		TArray<TPair<float, int32>> Dist;
		for (int32 Bn : Owners)
		{
			float D = 1e9f;
			for (const FSeg& S : Segs)
			{
				if (S.Bone != Bn) continue;
				const FVector AB = S.B - S.A;
				const double T = FMath::Clamp(FVector::DotProduct(P - S.A, AB) / FMath::Max(1e-3, AB.SizeSquared()), 0.0, 1.0);
				D = FMath::Min(D, (float)FVector::Dist(P, S.A + AB * T));
			}
			Dist.Add(TPair<float, int32>(D, Bn));
		}
		Dist.Sort([](const TPair<float, int32>& A, const TPair<float, int32>& B) { return A.Key < B.Key; });
		const int32 K = FMath::Min(4, Dist.Num());
		const float D0 = Dist[0].Key;
		float Sum = 0.f;
		TArray<float> Ws;
		Ws.SetNum(K);
		for (int32 j = 0; j < K; ++j)
		{
			// so entra quem esta a menos de D0 + 9 cm (um braco colado ao tronco nao deve puxar o osso errado)
			Ws[j] = (Dist[j].Key - D0 > 9.f) ? 0.f : FMath::Pow(1.f / (Dist[j].Key + 1.5f), Suavidade);
			Sum += Ws[j];
		}
		TArray<UE::AnimationCore::FBoneWeight> W;
		for (int32 j = 0; j < K; ++j)
			if (Ws[j] > 0.f) W.Add(UE::AnimationCore::FBoneWeight((FBoneIndexType)Dist[j].Value, Ws[j] / Sum));
		NSW.Set(NV, W);
	}

	TMap<FPolygonGroupID, FPolygonGroupID> GMap;
	TArray<FSkeletalMaterial> NewMats;
	const TArray<FStaticMaterial>& SM = Source->GetStaticMaterials();
	for (const FPolygonGroupID G : SD->PolygonGroups().GetElementIDs())
	{
		const FPolygonGroupID NG = ND.CreatePolygonGroup();
		const FName Slot = SSlots[G];
		NSlots[NG] = Slot;
		GMap.Add(G, NG);
		UMaterialInterface* Mat = nullptr;
		for (const FStaticMaterial& M : SM)
			if (M.ImportedMaterialSlotName == Slot || M.MaterialSlotName == Slot) { Mat = M.MaterialInterface; break; }
		NewMats.Add(FSkeletalMaterial(Mat, Slot));
	}
	for (const FTriangleID T : SD->Triangles().GetElementIDs())
	{
		TArrayView<const FVertexInstanceID> VIs = SD->GetTriangleVertexInstances(T);
		TArray<FVertexInstanceID> NVI;
		for (int32 c = 0; c < 3; ++c)
		{
			const FVertexInstanceID VI = VIs[c];
			const FVertexInstanceID NI = ND.CreateVertexInstance(VMap[SD->GetVertexInstanceVertex(VI)]);
			NNrm[NI] = FVector3f(Rot.RotateVector(FVector(SNrm[VI])));
			NTan[NI] = FVector3f::ZeroVector;
			NSgn[NI] = 1.f;
			NUV.Set(NI, 0, SUV.Get(VI, 0));
			NVI.Add(NI);
		}
		ND.CreateTriangle(GMap[SD->GetTrianglePolygonGroup(T)], NVI);
	}

	// ---- o asset: copia do Manny com a nova geometria ------------------------------------------------------------
	const FString LongName = FPackageName::ObjectPathToPackageName(PackagePath);
	UPackage* Pkg = CreatePackage(*LongName);
	const FString Base = FPackageName::GetShortName(LongName);
	USkeletalMesh* Out = DuplicateObject<USkeletalMesh>(Template, Pkg, FName(*Base));
	Out->SetFlags(RF_Public | RF_Standalone | RF_Transactional);
	Out->PreEditChange(nullptr);
	Out->SetMaterials(NewMats);
	Out->CreateMeshDescription(0, MoveTemp(ND));
	if (FSkeletalMeshLODInfo* Li = Out->GetLODInfo(0))
	{
		Li->BuildSettings.bRecomputeNormals = false;
		Li->BuildSettings.bRecomputeTangents = true;
		Li->BuildSettings.bUseMikkTSpace = true;
		Li->LODMaterialMap.Empty();
	}
	Out->CommitMeshDescription(0);
	Out->PostEditChange();
	Out->CalculateExtendedBounds();
	Out->MarkPackageDirty();
	FAssetRegistryModule::AssetCreated(Out);
	UE_LOG(LogTemp, Log, TEXT("AoE: SkeletalMesh %s: escala %.3f, %d vertices, %d triangulos"), *Base, Scale, SD->Vertices().Num(), SD->Triangles().Num());
	return Out;
#else
	return nullptr;
#endif
}

bool UAoESkinTools::SetAnimSkeleton(UAnimationAsset* Anim, USkeleton* Skeleton)
{
#if WITH_EDITOR
	if (!Anim || !Skeleton) return false;
	Anim->Modify();
	Anim->SetSkeleton(Skeleton);
	Anim->MarkPackageDirty();
	return true;
#else
	return false;
#endif
}
