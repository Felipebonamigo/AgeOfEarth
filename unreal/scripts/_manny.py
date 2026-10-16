import unreal
reg = unreal.AssetRegistryHelpers.get_asset_registry()
for a in reg.get_assets_by_path("/Game/Mannequins/Meshes", recursive=True):
    unreal.log("AOE_MANNY ativo %s %s" % (a.asset_class_path.asset_name, a.package_name))
for p in ("SKM_Manny_Simple", "SKM_Quinn_Simple"):
    sk = unreal.load_asset("/Game/Mannequins/Meshes/" + p)
    unreal.log("AOE_MANNY %s %s" % (p, sk.get_class().get_name() if sk else None))
    if sk:
        try:
            unreal.log("AOE_MANNY   skeleton: %s" % sk.get_editor_property("skeleton"))
        except Exception as e:
            unreal.log("AOE_MANNY   skeleton erro %s" % e)
        try:
            unreal.log("AOE_MANNY   bones: %s" % unreal.SkeletalMeshEditorSubsystem().get_num_verts(sk, 0))
        except Exception as e:
            unreal.log("AOE_MANNY   verts erro %s" % e)
for pasta in ("Unarmed", "Unarmed/Walk", "Unarmed/Jog", "Unarmed/Attack", "Death"):
    for a in reg.get_assets_by_path("/Game/Mannequins/Anims/" + pasta, recursive=False):
        unreal.log("AOE_MANNY anim %s %s" % (a.asset_class_path.asset_name, a.package_name))
