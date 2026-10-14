# U1: as animações do modelo Third Person ficaram com o USkeleton nulo (a referência apontava para outra pasta); no editor
# ainda tocam, mas o cook cai em "Zero key hash". Religa todas ao /Game/Mannequins/Meshes/SK_Mannequin. Idempotente.
import unreal

esq = unreal.load_asset("/Game/Mannequins/Meshes/SK_Mannequin")
reg = unreal.AssetRegistryHelpers.get_asset_registry()
n = 0
for a in reg.get_assets_by_path("/Game/Mannequins/Anims", recursive=True):
    if str(a.asset_class_path.asset_name) not in ("AnimSequence", "AnimMontage", "BlendSpace", "AimOffsetBlendSpace", "AnimComposite"):
        continue
    obj = unreal.load_asset(str(a.package_name))
    try:
        if obj is None:
            continue
        if True:
            unreal.AoESkinTools.set_anim_skeleton(obj, esq)
            unreal.EditorAssetLibrary.save_loaded_asset(obj)
            n += 1
    except Exception as e:
        unreal.log_warning("AOE_ANIM %s: %s" % (a.package_name, e))
unreal.log("AOE_ANIM religadas %d" % n)
