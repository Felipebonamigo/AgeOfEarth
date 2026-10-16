# U1: recalcula normais e tangentes das malhas da natureza no UE (as árvores saíam pretas: normais ruins vindas do glb
# reduzido). Folhagem fica sombreada por face (normais recomputadas, sem suavizar entre folhas soltas).
import unreal

sub = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
reg = unreal.AssetRegistryHelpers.get_asset_registry()
n = 0
for a in reg.get_assets_by_path("/Game/Meshy/natureza", recursive=True):
    if str(a.asset_class_path.asset_name) != "StaticMesh":
        continue
    m = a.get_asset()
    s = sub.get_lod_build_settings(m, 0)
    s.set_editor_property("recompute_normals", True)
    s.set_editor_property("recompute_tangents", True)
    s.set_editor_property("use_mikk_t_space", True)
    s.set_editor_property("remove_degenerates", True)
    sub.set_lod_build_settings(m, 0, s)
    unreal.EditorAssetLibrary.save_loaded_asset(m)
    n += 1
    unreal.log("AOE_NORMAIS %s" % a.package_name)
unreal.log("AOE_NORMAIS_FIM %d" % n)
