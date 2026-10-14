# U2: aves de ambiente (gaivota e águia CC0 do Mesh2Motion, já com pele no esqueleto de ave) -> /Game/Anim/aves/<nome>.
# O esqueleto importado de cada uma é declarado compatível com o da biblioteca de animações de ave (bird-animations), para
# que Flap/Glide/Idle toquem nelas sem duplicar animação. Editor FECHADO: unreal/scripts/ue.sh u2_aves.py /tmp/aves.log
import os

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
tools = unreal.AssetToolsHelpers.get_asset_tools()
reg = unreal.AssetRegistryHelpers.get_asset_registry()
BASE = unreal.load_asset("/Game/Anim/bird/bird-animations/SkeletalMeshes/bird-animations_Skeleton")
for nome in ("seagull", "eagle"):
    f = os.path.join(REPO, "unreal", "AgeOfEarthUE", "Content", "Fontes", "aves", nome + ".glb")
    t = unreal.AssetImportTask()
    t.set_editor_property("filename", f)
    t.set_editor_property("destination_path", "/Game/Anim/aves/" + nome)
    t.set_editor_property("automated", True)
    t.set_editor_property("replace_existing", True)
    t.set_editor_property("save", True)
    tools.import_asset_tasks([t])
    objs = [str(o) for o in t.get_editor_property("imported_object_paths")]
    unreal.log("AOE_AVES %s: %s" % (nome, objs))
    for o in objs:
        a = unreal.load_asset(o.split(".")[0])
        if isinstance(a, unreal.Skeleton) and BASE:
            try:
                lst = list(a.get_editor_property("compatible_skeletons"))
                lst.append(BASE)
                a.set_editor_property("compatible_skeletons", lst)
                unreal.EditorAssetLibrary.save_loaded_asset(a)
                unreal.log("AOE_AVES compativel %s" % o)
            except Exception as e:
                unreal.log_warning("AOE_AVES sem compatible_skeletons: %s" % e)
# e no sentido contrário (a biblioteca aceita as aves), para valer qualquer que seja o lado que o motor confere
if BASE:
    lst = list(BASE.get_editor_property("compatible_skeletons"))
    for nome in ("seagull", "eagle"):
        s = unreal.load_asset("/Game/Anim/aves/%s/%s/SkeletalMeshes/%s_Skeleton" % (nome, nome, nome))
        if s and s not in lst:
            lst.append(s)
    BASE.set_editor_property("compatible_skeletons", lst)
    unreal.EditorAssetLibrary.save_loaded_asset(BASE)
    unreal.log("AOE_AVES base aceita %d" % len(lst))
