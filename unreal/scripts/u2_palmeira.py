# U2/U3: LODs gerados para as palmeiras do Meshy (bioma deserto). Sem Nanite (folhagem fina + sombras virtuais: ver u2_arvore.py).
# Editor FECHADO: unreal/scripts/ue.sh u2_palmeira.py /tmp/palmeira.log
import unreal

reg = unreal.AssetRegistryHelpers.get_asset_registry()
sub = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
for a in reg.get_assets_by_path("/Game/Meshy/natureza", recursive=True):
    if str(a.asset_class_path.asset_name) != "StaticMesh" or "palm__" not in str(a.asset_name):
        continue
    m = unreal.load_asset(str(a.package_name))
    ns = m.get_editor_property("nanite_settings")
    ns.set_editor_property("enabled", False)
    m.set_editor_property("nanite_settings", ns)
    opc = unreal.StaticMeshReductionOptions()
    opc.set_editor_property("auto_compute_lod_screen_size", False)
    niveis = []
    for tela, frac in ((1.0, 1.0), (0.30, 0.45), (0.12, 0.2), (0.05, 0.08)):
        r = unreal.StaticMeshReductionSettings()
        r.set_editor_property("percent_triangles", frac)
        r.set_editor_property("screen_size", tela)
        niveis.append(r)
    opc.set_editor_property("reduction_settings", niveis)
    sub.set_lods(m, opc)
    unreal.EditorAssetLibrary.save_loaded_asset(m)
    unreal.log("AOE_PALMEIRA %s LODs %d, vertices %s" % (a.asset_name, sub.get_lod_count(m), [sub.get_number_verts(m, i) for i in range(sub.get_lod_count(m))]))

# folhas escuras de longe (textura de baixa luminancia, como as das unidades): Brilho do M_Meshy_Vento
mel = unreal.MaterialEditingLibrary
for a in reg.get_assets_by_path("/Game/Meshy/natureza", recursive=True):
    if "palm__" in str(a.package_name) and str(a.asset_class_path.asset_name) == "MaterialInstanceConstant":
        mi = unreal.load_asset(str(a.package_name))
        mel.set_material_instance_scalar_parameter_value(mi, "Brilho", 2.3)
        unreal.EditorAssetLibrary.save_loaded_asset(mi)
        unreal.log("AOE_PALMEIRA brilho %s" % a.asset_name)
