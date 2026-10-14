# U1: instancia a vegetação rasteira e as rochas (posições de plantas.json, gerado por u1_plantas.mjs) no mapa /Game/Maps/U1.
# Um ator "Vegetacao" com um HISM por malha. Idempotente (apaga o ator antigo). Uso: unreal/scripts/ue.sh u1_plantar.py /tmp/plantar.log
import json
import os
import traceback

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PASTA = os.environ.get("AOE_TERRAIN_DIR", os.path.join(REPO, "unreal", "exports", "teste"))
MAPA = os.environ.get("AOE_MAP", "/Game/Maps/U1")
RAIZ = "/Game/Vegetacao/"
DIST_FIM = {"capim": 5500.0, "flores": 6500.0, "samambaias": 8000.0, "rochas": 30000.0}
SOMBRA = {"capim": False, "flores": False, "samambaias": True, "rochas": True}


def carregar_malha(rel):
    pasta, nome = rel.split("/")
    for caminho in ("%s%s/%s/StaticMeshes/%s" % (RAIZ, pasta, pasta, nome),):
        m = unreal.load_asset(caminho)
        if m:
            return m
    unreal.log_warning("AOE_PLANTAR malha ausente: %s" % rel)
    return None


def main():
    with open(os.path.join(PASTA, "plantas.json"), encoding="utf-8") as f:
        grupos = json.load(f)
    lvl = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    lvl.load_level(MAPA)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for a in eas.get_all_level_actors():
        if a.get_actor_label() == "Vegetacao":
            eas.destroy_actor(a)
    ator = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 0))
    ator.set_actor_label("Vegetacao")
    total = 0
    for nome, g in grupos.items():
        malhas = [carregar_malha(m) for m in g["malhas"]]
        por_malha = {}
        for p in g["pontos"]:
            por_malha.setdefault(p["k"], []).append(p)
        for k, pts in por_malha.items():
            m = malhas[k]
            if not m:
                continue
            xf = []
            for p in pts:
                xf.append(unreal.Transform(
                    location=unreal.Vector(p["x"], p["y"], p["z"]),
                    rotation=unreal.Rotator(roll=0.0, pitch=p.get("pitch", 0.0), yaw=p["yaw"]),
                    scale=unreal.Vector(p["e"], p["e"], p["e"])))
            unreal.AoEMapTools.add_instanced_mesh(ator, m, xf, DIST_FIM[nome], SOMBRA[nome])
            total += len(xf)
    unreal.log("AOE_PLANTAR %d instancias" % total)
    lvl.save_current_level()
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
    unreal.log("AOE_PLANTAR_DONE")


try:
    main()
except Exception:
    unreal.log_error("AOE_PLANTAR FALHOU\n" + traceback.format_exc())
