# U2: as animações extras do humano (human_addon: mortes, arco, defesa...) vêm com um esqueleto próprio idêntico ao de human_base;
# religa cada uma ao esqueleto de human_base para tocarem nos mesmos SkeletalMesh. Idempotente. Editor FECHADO.
import unreal

base = unreal.load_asset("/Game/Anim/human_base/human-base-animations/SkeletalMeshes/human-base-animations_Skeleton")
reg = unreal.AssetRegistryHelpers.get_asset_registry()
n = 0
for a in reg.get_assets_by_path("/Game/Anim/human_addon", recursive=True):
    if str(a.asset_class_path.asset_name) != "AnimSequence":
        continue
    obj = unreal.load_asset(str(a.package_name))
    if obj and unreal.AoESkinTools.set_anim_skeleton(obj, base):
        unreal.EditorAssetLibrary.save_loaded_asset(obj)
        n += 1
unreal.log("AOE_LIGAR %d animacoes religadas ao esqueleto de human_base" % n)
