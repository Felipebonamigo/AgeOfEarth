# Monta o mapa U0 (/Game/Maps/U0) no editor: material do terreno, Landscape importado do exportador, céu/luz/névoa/nuvens
# (Lumen), água do plugin Water em Z = 0 e um PlayerStart. Rode (da raiz do repositório):
#   UnrealEditor-Cmd.exe unreal\AgeOfEarthUE\AgeOfEarthUE.uproject -ExecutePythonScript=unreal\scripts\build_u0_map.py -unattended -nopause -nosplash
# Antes: npm run unreal:terrain -- --seed 42 --size small --out unreal/exports/teste   e compile o projeto (Build.bat ... Editor).
import json
import os
import traceback

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TERRAIN_DIR = os.environ.get("AOE_TERRAIN_DIR", os.path.join(REPO, "unreal", "exports", "teste"))
MAP_PATH = os.environ.get("AOE_MAP", "/Game/Maps/U0")
# depuração: nomes (parte do nome) de passos a pular, ex.: AOE_SKIP=postprocess,water,volumetric,exponential
SKIP = [k.lower() for k in os.environ.get("AOE_SKIP", "").split(",") if k]
MAT_PATH = "/Game/Maps/M_U0_Terrain"
LAYER_DIR = "/Game/Maps/U0_Layers"
LAYERS = ["grass", "dirt", "sand", "rock"]
# cor linear de cada camada (sem texturas: Megascans/Fab entram depois, pelo dono)
COLORS = {"grass": (0.05, 0.085, 0.022), "dirt": (0.16, 0.095, 0.05), "sand": (0.55, 0.45, 0.28), "rock": (0.30, 0.285, 0.26)}

mel = unreal.MaterialEditingLibrary


def step(name, fn):
    if any(k in name.lower() for k in SKIP):
        unreal.log("AOE_STEP pulado: %s" % name)
        return None
    try:
        r = fn()
        unreal.log("AOE_STEP ok: %s" % name)
        return r
    except Exception:
        unreal.log_error("AOE_STEP FALHOU: %s\n%s" % (name, traceback.format_exc()))
        return None


def build_material():
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    if unreal.EditorAssetLibrary.does_asset_exist(MAT_PATH):
        unreal.EditorAssetLibrary.delete_asset(MAT_PATH)
    mat = tools.create_asset("M_U0_Terrain", "/Game/Maps", unreal.Material, unreal.MaterialFactoryNew())

    def color(name, rgb, x, y):
        n = mel.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, x, y)
        n.set_editor_property("constant", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
        return n

    base = color("grass", COLORS["grass"], -900, 0)
    prev = base
    for i, name in enumerate(["dirt", "sand", "rock"]):
        c = color(name, COLORS[name], -900, 220 * (i + 1))
        w = mel.create_material_expression(mat, unreal.MaterialExpressionLandscapeLayerWeight, -500 + 220 * i, 100 * i)
        w.set_editor_property("parameter_name", name)
        w.set_editor_property("preview_weight", 0.0)
        mel.connect_material_expressions(prev, "", w, "Base")
        mel.connect_material_expressions(c, "", w, "Layer")
        prev = w
    mel.connect_material_property(prev, "", unreal.MaterialProperty.MP_BASE_COLOR)
    rough = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -300, 400)
    rough.set_editor_property("r", 0.92)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0), label=None):
    actor = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).spawn_actor_from_class(
        # atenção: unreal.Rotator(roll, pitch, yaw) — por isso os argumentos nomeados (rot = pitch, yaw, roll)
        cls, unreal.Vector(*loc), unreal.Rotator(roll=rot[2], pitch=rot[0], yaw=rot[1]))
    if label:
        actor.set_actor_label(label)
    return actor


def main():
    with open(os.path.join(TERRAIN_DIR, "terrain.json"), encoding="utf-8") as f:
        t = json.load(f)
    res = t["landscape"]["resolution"]
    size_uu = t["w"] * t["uuPerTile"]
    center = (size_uu / 2.0, size_uu / 2.0)
    unreal.log("AOE terreno %s: %dx%d tiles, landscape %d, %.3f uu/quad" % (t["name"], t["w"], t["h"], res, t["landscape"]["scaleXY"]))

    lvl = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    step("novo nivel", lambda: lvl.new_level(MAP_PATH))
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()

    mat = step("material do terreno", build_material)
    pngs = [os.path.join(TERRAIN_DIR, "layer-%s.png" % n) for n in LAYERS]
    landscape = step("importar Landscape", lambda: unreal.AoEMapTools.import_landscape(
        world, os.path.join(TERRAIN_DIR, "heightmap.r16"), res, t["landscape"]["scaleXY"], t["landscape"]["scaleZ"],
        mat, LAYERS, pngs, LAYER_DIR))
    if landscape:
        landscape.set_actor_label("Terreno")

    # ---- céu e luz (Lumen) ----
    step("SkyAtmosphere", lambda: spawn(unreal.SkyAtmosphere, label="Atmosfera"))

    def sun():
        d = spawn(unreal.DirectionalLight, (center[0], center[1], 6000), (-38, 55, 0), "Sol")
        c = d.get_component_by_class(unreal.DirectionalLightComponent)
        c.set_mobility(unreal.ComponentMobility.MOVABLE)
        c.set_editor_property("atmosphere_sun_light", True)
        c.set_editor_property("intensity", 9.0)
        c.set_editor_property("light_source_angle", 0.6)
    step("DirectionalLight", sun)

    def sky():
        s = spawn(unreal.SkyLight, (center[0], center[1], 6000), label="Luz do ceu")
        c = s.get_component_by_class(unreal.SkyLightComponent)
        c.set_mobility(unreal.ComponentMobility.MOVABLE)
        c.set_editor_property("real_time_capture", True)
    step("SkyLight", sky)

    def fog():
        f = spawn(unreal.ExponentialHeightFog, (center[0], center[1], 2500), label="Nevoa")
        c = f.get_component_by_class(unreal.ExponentialHeightFogComponent)
        c.set_editor_property("fog_density", 0.012)
    step("ExponentialHeightFog", fog)
    step("VolumetricCloud", lambda: spawn(unreal.VolumetricCloud, (center[0], center[1], 3000), label="Nuvens"))

    def post():
        p = spawn(unreal.PostProcessVolume, (center[0], center[1], 0), label="Pos-processamento")
        p.set_editor_property("unbound", True)
        s = p.get_editor_property("settings")
        s.set_editor_property("override_dynamic_global_illumination_method", True)
        s.set_editor_property("dynamic_global_illumination_method", unreal.DynamicGlobalIlluminationMethod.LUMEN)
        s.set_editor_property("override_reflection_method", True)
        s.set_editor_property("reflection_method", unreal.ReflectionMethod.LUMEN)
        p.set_editor_property("settings", s)
    step("PostProcessVolume (Lumen)", post)

    # ---- água (plugin Water) no nível Z = 0 ----
    def water():
        if os.environ.get("AOE_WATER_OCEAN"):
            # WaterBodyOcean + WaterZone: depende da textura de informação da zona, que o Landscape importado por código
            # não gera -> retângulos de céu e borda preta em volta da ilha. Fica só como variante de teste.
            spawn(unreal.WaterZone, (center[0], center[1], 0), label="Zona de agua")
            return spawn(unreal.WaterBodyOcean, (center[0], center[1], 0), label="Mar")
        # padrão: corpo d'água "custom" = um plano grande em Z = 0 com o material de água do plugin Water
        sea = spawn(unreal.WaterBodyCustom, (center[0], center[1], 0), label="Mar")
        comp = sea.get_editor_property("water_body_component")
        comp.set_editor_property("water_mesh_override", unreal.load_asset("/Engine/BasicShapes/Plane"))
        sea.set_actor_scale3d(unreal.Vector(size_uu * 4.0 / 100.0, size_uu * 4.0 / 100.0, 1.0))
        return sea
    step("Water (oceano)", water)

    step("PlayerStart", lambda: spawn(unreal.PlayerStart, (center[0], center[1], 3000), label="Inicio"))

    step("salvar nivel", lambda: lvl.save_current_level())
    step("salvar pacotes", lambda: unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True))
    unreal.log("AOE_MAP_DONE")


main()
