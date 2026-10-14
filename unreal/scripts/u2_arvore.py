# U2: árvores CC0 do Poly Haven (island_tree_02, 1,76 mi triângulos) com Nanite, no lugar das árvores do Meshy reduzidas
# (facetadas de perto). Folhas: mestre M_Folha (recortado pelo alfa, dupla face, luz atravessando), SEM vento por vértice:
# Nanite + WPO + mapa de sombras virtual travou a GPU antes (u1_nanite.py). Tronco/galhos: M_Rocha (opaco).
# Nanite com "preservar área" (folhagem não some ao simplificar de longe). Editor FECHADO: unreal/scripts/ue.sh u2_arvore.py
import os

import unreal

mel = unreal.MaterialEditingLibrary
reg = unreal.AssetRegistryHelpers.get_asset_registry()
ARVORES = [s for s in os.environ.get("AOE_ARVORES", "island_tree_02").split(",") if s]

folha = unreal.load_asset("/Game/Meshy/M_Folha")
rocha = unreal.load_asset("/Game/Meshy/M_Rocha")
if not folha or not rocha:
    raise RuntimeError("rode antes u1_vegetal.py (cria M_Folha e M_Rocha)")
for nome in ARVORES:
    base = "/Game/Vegetacao/%s/%s" % (nome, nome)
    for a in reg.get_assets_by_path(base + "/Materials", recursive=False):
        mi = unreal.load_asset(str(a.package_name))
        eh_folha = "leaves" in str(a.asset_name) or "leaf" in str(a.asset_name)
        mi.set_editor_property("parent", folha if eh_folha else rocha)
        for tp in mi.get_editor_property("texture_parameter_values"):
            tex = tp.parameter_value
            if not tex:
                continue
            n = str(tp.parameter_info.name)
            if n == "NormalTexture":
                tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                tex.set_editor_property("srgb", False)
            elif n == "MetallicRoughnessTexture":
                tex.set_editor_property("srgb", False)
            unreal.EditorAssetLibrary.save_loaded_asset(tex)
        unreal.EditorAssetLibrary.save_loaded_asset(mi)
        unreal.log("AOE_ARVORE %s -> %s" % (a.asset_name, "M_Folha" if eh_folha else "M_Rocha"))
    for a in reg.get_assets_by_path(base + "/StaticMeshes", recursive=False):
        m = unreal.load_asset(str(a.package_name))
        ns = m.get_editor_property("nanite_settings")
        ns.set_editor_property("enabled", True)
        try:
            ns.set_editor_property("preserve_area", True)
        except Exception:
            pass
        m.set_editor_property("nanite_settings", ns)
        unreal.EditorAssetLibrary.save_loaded_asset(m)
        unreal.log("AOE_ARVORE Nanite em %s" % a.asset_name)
