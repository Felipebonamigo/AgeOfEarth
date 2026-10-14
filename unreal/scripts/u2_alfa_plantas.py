# U2: as plantas do Poly Haven vieram com o difuso em JPG (sem alfa) e o recorte das folhas estava num mapa "Alpha" separado;
# sem alfa, os cartões das folhas apareciam inteiros (manchas escuras no chão). Este script importa o difuso RGBA montado por
# alpha.mjs (Content/Fontes/vegetacao/<id>/textures/<id>_diff_alpha_1k.png) e troca o parâmetro BaseColorTexture do material de
# cada planta por ele. O mestre M_Vegetal já recorta pelo canal A. Editor FECHADO.
import os

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
tools = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
reg = unreal.AssetRegistryHelpers.get_asset_registry()
for d in sorted(os.listdir(os.path.join(REPO, "unreal", "AgeOfEarthUE", "Content", "Fontes", "vegetacao"))):
    png = os.path.join(REPO, "unreal", "AgeOfEarthUE", "Content", "Fontes", "vegetacao", d, "textures", d + "_diff_alpha_1k.png")
    if not os.path.exists(png):
        continue
    destino = "/Game/Vegetacao/%s/%s/Textures" % (d, d)
    t = unreal.AssetImportTask()
    t.set_editor_property("filename", png)
    t.set_editor_property("destination_path", destino)
    t.set_editor_property("destination_name", d + "_diff_alpha")
    t.set_editor_property("automated", True)
    t.set_editor_property("replace_existing", True)
    t.set_editor_property("save", True)
    tools.import_asset_tasks([t])
    tex = unreal.load_asset(destino + "/" + d + "_diff_alpha")
    if not tex:
        unreal.log_error("AOE_ALFA sem textura " + d)
        continue
    tex.set_editor_property("srgb", True)
    tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_DEFAULT)
    unreal.EditorAssetLibrary.save_loaded_asset(tex)
    n = 0
    for a in reg.get_assets_by_path("/Game/Vegetacao/%s" % d, recursive=True):
        if str(a.asset_class_path.asset_name) != "MaterialInstanceConstant":
            continue
        mi = unreal.load_asset(str(a.package_name))
        mel.set_material_instance_texture_parameter_value(mi, "BaseColorTexture", tex)
        # sem alfa no material original (bermuda, gazânia): usa o mestre recortado também
        mi.set_editor_property("parent", unreal.load_asset("/Game/Meshy/M_Vegetal"))
        unreal.EditorAssetLibrary.save_loaded_asset(mi)
        n += 1
    unreal.log("AOE_ALFA %s: textura RGBA e %d material(is)" % (d, n))
