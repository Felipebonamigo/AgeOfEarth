# Lista as malhas importadas em /Game/Meshy (caminho, caixa em cm, material) e grava unreal/exports/malhas.json.
import json
import os

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
reg = unreal.AssetRegistryHelpers.get_asset_registry()
saida = {}
for a in reg.get_assets_by_path("/Game/Meshy", recursive=True):
    cls = str(a.asset_class_path.asset_name)
    if cls not in ("StaticMesh", "SkeletalMesh"):
        continue
    obj = a.get_asset()
    path = str(a.package_name)
    if cls == "StaticMesh":
        b = obj.get_bounds()
        ext = b.box_extent
        o = b.origin
        mats = list(obj.static_materials)
        tris = obj.get_num_triangles(0) if hasattr(obj, "get_num_triangles") else -1
        saida[path] = {"tipo": cls, "origem": [o.x, o.y, o.z], "meia_caixa": [ext.x, ext.y, ext.z], "materiais": len(mats)}
    else:
        saida[path] = {"tipo": cls}
os.makedirs(os.path.join(REPO, "unreal", "exports"), exist_ok=True)
with open(os.path.join(REPO, "unreal", "exports", "malhas.json"), "w", encoding="utf-8") as f:
    json.dump(saida, f, indent=1, ensure_ascii=False)
unreal.log("AOE_LISTA %d malhas" % len(saida))
