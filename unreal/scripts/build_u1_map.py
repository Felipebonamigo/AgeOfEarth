# U1: monta /Game/Maps/U1 — terreno com texturas reais (Poly Haven, CC0) em 4 camadas com quebra de repetição, céu/luz Lumen,
# nuvens, névoa, pós-processamento e o mar. Pré-requisito: unreal/scripts/u1_importar.py (texturas em /Game/Terreno/Texturas)
# e o terreno exportado em unreal/exports/teste (seed 42 small, o mesmo da ponte). Rode da raiz (editor FECHADO):
#   unreal/scripts/ue.sh build_u1_map.py /tmp/u1map.log
# Variáveis: AOE_MAP (padrão /Game/Maps/U1), AOE_AGUA=oceano|custom (padrão oceano), AOE_SKIP=trecho,trecho.
import json
import os
import traceback

import unreal

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TERRAIN_DIR = os.environ.get("AOE_TERRAIN_DIR", os.path.join(REPO, "unreal", "exports", "teste"))
MAP_PATH = os.environ.get("AOE_MAP", "/Game/Maps/U1")
AGUA = os.environ.get("AOE_AGUA", "mar")   # mar = plano com M_Mar (ondas+espuma, u1_mar.py); custom/oceano = plugin Water
SKIP = [k.lower() for k in os.environ.get("AOE_SKIP", "").split(",") if k]
MAT_PATH = "/Game/Terreno/M_U1_Terreno"
LAYER_DIR = "/Game/Terreno/Camadas"
TEX = "/Game/Terreno/Texturas/"
LAYERS = ["grass", "dirt", "sand", "rock"]
# id do Poly Haven, metros que a foto cobre (ladrilho) e quanto escurecer/saturar (ajuste fino do tom mediterrâneo)
FOTOS = {
    "grass": ("rocky_terrain_02", 3.0),
    "dirt": ("brown_mud_dry", 3.0),
    "sand": ("dense_sand", 3.0),
    "rock": ("aerial_rocks_02", 6.0),
}

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


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def constante(mat, v, x, y):
    n = no(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", v)
    return n


def mult(mat, a, b, x, y, a_out="", b_out=""):
    n = no(mat, unreal.MaterialExpressionMultiply, x, y)
    mel.connect_material_expressions(a, a_out, n, "A")
    mel.connect_material_expressions(b, b_out, n, "B")
    return n


def amostra(mat, nome, coord, x, y, tipo):
    t = unreal.load_asset(TEX + nome)
    n = no(mat, unreal.MaterialExpressionTextureSample, x, y)
    n.set_editor_property("texture", t)
    n.set_editor_property("sampler_type", tipo)
    mel.connect_material_expressions(coord, "", n, "UVs")
    return n


def ondas(mat, wp, fx, fy, x, y, lo=0.0, hi=1.0):
    """lo..hi variando devagar com a posição (x e y em cm): média de duas senoides cruzadas, sem textura nem ruído."""
    comps = []
    for i, (canal, f) in enumerate((('r', fx), ('g', fy))):
        m = no(mat, unreal.MaterialExpressionComponentMask, x, y + i * 160)
        for c in 'rgba':
            m.set_editor_property(c, c == canal)
        mel.connect_material_expressions(wp, '', m, '')
        k = constante(mat, f * 6.2831853, x + 140, y + i * 160)
        mm = mult(mat, m, k, x + 280, y + i * 160)
        s = no(mat, unreal.MaterialExpressionSine, x + 420, y + i * 160)
        mel.connect_material_expressions(mm, '', s, '')
        comps.append(s)
    soma = no(mat, unreal.MaterialExpressionAdd, x + 560, y + 80)
    mel.connect_material_expressions(comps[0], '', soma, 'A')
    mel.connect_material_expressions(comps[1], '', soma, 'B')
    # soma em -2..2  ->  lo..hi
    esc = constante(mat, (hi - lo) / 4.0, x + 560, y + 240)
    mm2 = mult(mat, soma, esc, x + 700, y + 80)
    off = constante(mat, (hi + lo) / 2.0, x + 700, y + 240)
    r = no(mat, unreal.MaterialExpressionAdd, x + 840, y + 80)
    mel.connect_material_expressions(mm2, '', r, 'A')
    mel.connect_material_expressions(off, '', r, 'B')
    return r


def camada(mat, ph_id, metros, x, y, ruido):
    """Devolve (cor, rugosidade, normal) já com quebra de repetição: duas amostras em escalas diferentes misturadas por ruído."""
    wp = no(mat, unreal.MaterialExpressionWorldPosition, x - 700, y)
    xy = no(mat, unreal.MaterialExpressionComponentMask, x - 560, y)
    xy.set_editor_property("r", True)
    xy.set_editor_property("g", True)
    xy.set_editor_property("b", False)
    xy.set_editor_property("a", False)
    mel.connect_material_expressions(wp, "", xy, "")
    s1 = constante(mat, 1.0 / (metros * 100.0), x - 560, y + 80)
    s2 = constante(mat, 1.0 / (metros * 100.0 * 0.43), x - 560, y + 140)
    uv1 = mult(mat, xy, s1, x - 420, y)
    uv2 = mult(mat, xy, s2, x - 420, y + 100)
    st = unreal.MaterialSamplerType
    saida = []
    for sufixo, tipo in (("_Diffuse", st.SAMPLERTYPE_COLOR), ("_Rough", st.SAMPLERTYPE_MASKS), ("_nor_gl", st.SAMPLERTYPE_NORMAL)):
        a = amostra(mat, ph_id + sufixo, uv1, x - 250, y + (0 if sufixo == "_Diffuse" else 160 if sufixo == "_Rough" else 320), tipo)
        b = amostra(mat, ph_id + sufixo, uv2, x - 250, y + 80 + (0 if sufixo == "_Diffuse" else 160 if sufixo == "_Rough" else 320), tipo)
        l = no(mat, unreal.MaterialExpressionLinearInterpolate, x - 80, y + (0 if sufixo == "_Diffuse" else 160 if sufixo == "_Rough" else 320))
        mel.connect_material_expressions(a, "", l, "A")
        mel.connect_material_expressions(b, "", l, "B")
        mel.connect_material_expressions(ruido, "", l, "Alpha")
        saida.append(l)
    return saida


def build_material():
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    if unreal.EditorAssetLibrary.does_asset_exist(MAT_PATH):
        unreal.EditorAssetLibrary.delete_asset(MAT_PATH)
    mat = tools.create_asset("M_U1_Terreno", "/Game/Terreno", unreal.Material, unreal.MaterialFactoryNew())
    # máscara de baixa frequência (0..1) por senoides cruzadas: decide, ponto a ponto, qual das duas escalas aparece (some o ladrilhamento)
    wpn = no(mat, unreal.MaterialExpressionWorldPosition, -1700, -400)
    ru = ondas(mat, wpn, 0.0011, 0.0017, -1500, -400)

    cores, ruges, normais = {}, {}, {}
    y = 0
    for nome in LAYERS:
        ph, metros = FOTOS[nome]
        c, r, n = camada(mat, ph, metros, 0, y, ru)
        cores[nome], ruges[nome], normais[nome] = c, r, n
        y += 700

    # a foto da grama é amarelada à luz direta: puxa para o verde (só nesta camada)
    tom = no(mat, unreal.MaterialExpressionConstant3Vector, 300, -80)
    tom.set_editor_property("constant", unreal.LinearColor(0.80, 0.96, 0.62, 1.0))
    cores["grass"] = mult(mat, cores["grass"], tom, 450, -40)

    def cadeia(dic, x, y0):
        prev = dic["grass"]
        for i, nome in enumerate(["dirt", "sand", "rock"]):
            w = no(mat, unreal.MaterialExpressionLandscapeLayerWeight, x + 220 * i, y0 + 120 * i)
            w.set_editor_property("parameter_name", nome)
            w.set_editor_property("preview_weight", 0.0)
            mel.connect_material_expressions(prev, "", w, "Base")
            mel.connect_material_expressions(dic[nome], "", w, "Layer")
            prev = w
        return prev

    cor = cadeia(cores, 600, 0)
    rug = cadeia(ruges, 600, 900)
    nor = cadeia(normais, 600, 1800)
    # variação de cor em grande escala (manchas de solo úmido/seco) para quebrar a uniformidade a distância
    macro = ondas(mat, wpn, 0.00031, 0.00043, -1500, -900, 0.74, 1.14)
    cor2 = mult(mat, cor, macro, 1100, 0)
    mel.connect_material_property(cor2, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(rug, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(nor, "", unreal.MaterialProperty.MP_NORMAL)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0), label=None):
    actor = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).spawn_actor_from_class(
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

    step("SkyAtmosphere", lambda: spawn(unreal.SkyAtmosphere, label="Atmosfera"))

    def sun():
        d = spawn(unreal.DirectionalLight, (center[0], center[1], 6000), (-27, 58, 0), "Sol")
        c = d.get_component_by_class(unreal.DirectionalLightComponent)
        c.set_mobility(unreal.ComponentMobility.MOVABLE)
        c.set_editor_property("atmosphere_sun_light", True)
        c.set_editor_property("intensity", 6.4)
        c.set_editor_property("light_source_angle", 0.5)
        c.set_editor_property("light_color", unreal.Color(255, 236, 208, 255))
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
        c.set_editor_property("fog_density", 0.006)
        c.set_editor_property("fog_height_falloff", 0.35)
        c.set_editor_property("start_distance", 8000.0)
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
        s.set_editor_property("override_auto_exposure_method", True)
        s.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_HISTOGRAM)
        s.set_editor_property("override_auto_exposure_bias", True)
        s.set_editor_property("auto_exposure_bias", 0.0)
        s.set_editor_property("override_bloom_intensity", True)
        s.set_editor_property("bloom_intensity", 0.35)
        s.set_editor_property("override_vignette_intensity", True)
        s.set_editor_property("vignette_intensity", 0.25)
        s.set_editor_property("override_motion_blur_amount", True)
        s.set_editor_property("motion_blur_amount", 0.0)
        p.set_editor_property("settings", s)
    step("PostProcessVolume", post)

    def agua():
        if AGUA == "oceano":
            zona = spawn(unreal.WaterZone, (center[0], center[1], 0), label="Zona de agua")
            zona.set_editor_property("zone_extent", unreal.Vector2D(size_uu * 1.6, size_uu * 1.6))
            zona.set_editor_property("render_target_resolution", unreal.IntPoint(2048, 2048))
            mar = spawn(unreal.WaterBodyOcean, (center[0], center[1], 0), label="Mar")
            return mar
        if AGUA == "mar":
            plano = spawn(unreal.StaticMeshActor, (center[0], center[1], 0), label="Mar")
            comp = plano.get_editor_property("static_mesh_component")
            comp.set_editor_property("static_mesh", unreal.load_asset("/Engine/BasicShapes/Plane"))
            comp.set_material(0, unreal.load_asset("/Game/Terreno/M_Mar"))
            comp.set_editor_property("cast_shadow", False)
            comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
            plano.set_actor_scale3d(unreal.Vector(size_uu * 4.0 / 100.0, size_uu * 4.0 / 100.0, 1.0))
            return plano
        sea = spawn(unreal.WaterBodyCustom, (center[0], center[1], 0), label="Mar")
        comp = sea.get_editor_property("water_body_component")
        comp.set_editor_property("water_mesh_override", unreal.load_asset("/Engine/BasicShapes/Plane"))
        sea.set_actor_scale3d(unreal.Vector(size_uu * 4.0 / 100.0, size_uu * 4.0 / 100.0, 1.0))
        return sea
    step("Agua", agua)

    step("PlayerStart", lambda: spawn(unreal.PlayerStart, (center[0], center[1], 3000), label="Inicio"))
    step("salvar nivel", lambda: lvl.save_current_level())
    step("salvar pacotes", lambda: unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True))
    unreal.log("AOE_MAP_DONE")


main()
