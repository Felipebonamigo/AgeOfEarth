# U1: importa para o projeto as texturas do terreno (Poly Haven, CC0) e os .glb do Meshy (art/meshy/*), por Python do
# editor. Uso (da raiz do repositório; feche o editor antes):
#   UnrealEditor-Cmd.exe unreal\AgeOfEarthUE\AgeOfEarthUE.uproject -ExecutePythonScript=unreal\scripts\u1_importar.py -unattended -nopause -nosplash
# Variáveis: AOE_ONLY=parte do nome (importa só o que casar), AOE_PASTAS=edificios,natureza,unidades,criaturas.
import glob
import os
import traceback

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ONLY = [s for s in os.environ.get("AOE_ONLY", "").lower().split(",") if s]
PASTAS = [p for p in os.environ.get("AOE_PASTAS", "edificios,natureza,unidades,criaturas").split(",") if p]
TEX_DIR = os.path.join(REPO, "unreal", "AgeOfEarthUE", "Content", "Fontes", "terreno")

tools = unreal.AssetToolsHelpers.get_asset_tools()


def importar(arquivo, destino, nome):
    t = unreal.AssetImportTask()
    t.set_editor_property("filename", arquivo)
    t.set_editor_property("destination_path", destino)
    t.set_editor_property("destination_name", nome)
    t.set_editor_property("automated", True)
    t.set_editor_property("replace_existing", True)
    t.set_editor_property("save", True)
    tools.import_asset_tasks([t])
    return list(t.get_editor_property("imported_object_paths"))


def texturas():
    for f in sorted(glob.glob(os.path.join(TEX_DIR, "*.png"))):
        nome = os.path.splitext(os.path.basename(f))[0]
        if ONLY and not any(o in nome.lower() for o in ONLY):
            continue
        try:
            r = importar(f, "/Game/Terreno/Texturas", nome)
            unreal.log("AOE_IMPORT tex %s -> %s" % (nome, r))
            tex = unreal.load_asset("/Game/Terreno/Texturas/" + nome)
            if tex:
                if "_Diffuse" in nome:
                    tex.set_editor_property("srgb", True)
                else:
                    tex.set_editor_property("srgb", False)
                if "_nor_gl" in nome:
                    tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                elif "_Rough" in nome or "_AO" in nome or "_Displacement" in nome:
                    tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
                unreal.EditorAssetLibrary.save_loaded_asset(tex)
        except Exception:
            unreal.log_error("AOE_IMPORT FALHOU tex %s\n%s" % (nome, traceback.format_exc()))


def modelos():
    for pasta in PASTAS:
        for f in sorted(glob.glob(os.path.join(REPO, "art", "meshy", pasta, "*.glb"))):
            nome = os.path.splitext(os.path.basename(f))[0].replace("-", "_")
            if ONLY and not any(o in nome.lower() for o in ONLY):
                continue
            try:
                r = importar(f, "/Game/Meshy/" + pasta, nome)
                unreal.log("AOE_IMPORT glb %s/%s -> %s" % (pasta, nome, r))
            except Exception:
                unreal.log_error("AOE_IMPORT FALHOU glb %s\n%s" % (nome, traceback.format_exc()))


if not os.environ.get("AOE_VEG"):
    texturas()
    modelos()
unreal.log("AOE_IMPORT_DONE")


def vegetacao():
    """Plantas e rochas CC0 do Poly Haven (Content/Fontes/vegetacao/<id>/<id>.gltf) -> /Game/Vegetacao/<id>."""
    base = os.path.join(REPO, "unreal", "AgeOfEarthUE", "Content", "Fontes", "vegetacao")
    for d in sorted(glob.glob(os.path.join(base, "*"))):
        nome = os.path.basename(d)
        if ONLY and not any(o in nome.lower() for o in ONLY):
            continue
        gltf = os.path.join(d, nome + ".gltf")
        if not os.path.exists(gltf):
            continue
        try:
            r = importar(gltf, "/Game/Vegetacao/" + nome, nome)
            unreal.log("AOE_IMPORT veg %s -> %s" % (nome, r[:3]))
        except Exception:
            unreal.log_error("AOE_IMPORT FALHOU veg %s\n%s" % (nome, traceback.format_exc()))


if os.environ.get("AOE_VEG"):
    vegetacao()
