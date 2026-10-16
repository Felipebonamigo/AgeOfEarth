# U1/U2: importa as bibliotecas de animação CC0 do Mesh2Motion (rigs humano, cavalo, raposa, dragão, ave, serpente, aranha, kaiju)
# de Content/Fontes/animacoes/<nome>-animations.glb para /Game/Anim/<nome>: malha de prévia + esqueleto + todas as animações.
import glob
import os
import traceback

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ONLY = [s for s in os.environ.get("AOE_ONLY", "").lower().split(",") if s]
tools = unreal.AssetToolsHelpers.get_asset_tools()
for f in sorted(glob.glob(os.path.join(REPO, "unreal", "AgeOfEarthUE", "Content", "Fontes", "animacoes", "*-animations.glb"))):
    nome = os.path.basename(f).replace("-animations.glb", "").replace("-", "_")
    if ONLY and nome not in ONLY:
        continue
    try:
        t = unreal.AssetImportTask()
        t.set_editor_property("filename", f)
        t.set_editor_property("destination_path", "/Game/Anim/" + nome)
        t.set_editor_property("automated", True)
        t.set_editor_property("replace_existing", True)
        t.set_editor_property("save", True)
        tools.import_asset_tasks([t])
        objs = list(t.get_editor_property("imported_object_paths"))
        unreal.log("AOE_ANIM %s: %d objetos, ex.: %s" % (nome, len(objs), objs[:4]))
    except Exception:
        unreal.log_error("AOE_ANIM FALHOU %s\n%s" % (nome, traceback.format_exc()))
