# U1: mestre M_Vegetal (folhagem recortada por alfa, dupla face, vento leve, instanciável) e troca do pai dos materiais das
# plantas/rochas Poly Haven em /Game/Vegetacao. Idempotente. Uso: unreal/scripts/ue.sh u1_vegetal.py /tmp/veg2.log
import traceback

import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
reg = unreal.AssetRegistryHelpers.get_asset_registry()


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def param_tex(mat, nome, padrao, tipo, x, y):
    n = no(mat, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
    n.set_editor_property("parameter_name", nome)
    n.set_editor_property("texture", unreal.load_asset(padrao))
    n.set_editor_property("sampler_type", tipo)
    return n


def const(mat, v, x, y):
    n = no(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", v)
    return n


def mult(mat, a, b, x, y, ao="", bo=""):
    n = no(mat, unreal.MaterialExpressionMultiply, x, y)
    mel.connect_material_expressions(a, ao, n, "A")
    mel.connect_material_expressions(b, bo, n, "B")
    return n


def mestre(nome, mascara, vento):
    caminho = "/Game/Meshy/" + nome
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        unreal.EditorAssetLibrary.delete_asset(caminho)
    mat = tools.create_asset(nome, "/Game/Meshy", unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    mat.set_editor_property("two_sided", True)
    if mascara:
        mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)   # luz que atravessa a folha: some o preto à sombra
        mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        mat.set_editor_property("opacity_mask_clip_value", 0.45)
    st = unreal.MaterialSamplerType
    cor = param_tex(mat, "BaseColorTexture", "/Engine/EngineResources/WhiteSquareTexture", st.SAMPLERTYPE_COLOR, -900, 0)
    nor = param_tex(mat, "NormalTexture", "/Engine/EngineMaterials/DefaultNormal", st.SAMPLERTYPE_NORMAL, -900, 300)
    mr = param_tex(mat, "MetallicRoughnessTexture", "/Game/Meshy/T_BrancoLinear", st.SAMPLERTYPE_LINEAR_COLOR, -900, 600)
    # folhas das fotos são escuras à luz do jogo (manchas pretas no chão de longe): clareia e puxa um pouco para o amarelo-oliva
    brilho = no(mat, unreal.MaterialExpressionVectorParameter, -700, -100)
    brilho.set_editor_property("parameter_name", "Brilho")
    brilho.set_editor_property("default_value", unreal.LinearColor(1.45, 1.5, 1.2, 1.0) if mascara else unreal.LinearColor(1.0, 1.0, 1.0, 1.0))
    cor_b = mult(mat, cor, brilho, -450, -50, "RGB", "RGB")
    mel.connect_material_property(cor_b, "", unreal.MaterialProperty.MP_BASE_COLOR)
    if mascara:
        mel.connect_material_property(cor, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    mel.connect_material_property(nor, "RGB", unreal.MaterialProperty.MP_NORMAL)
    if mascara:
        sub = mult(mat, cor, const(mat, 0.55, -500, -150), -300, -150, "RGB", "")
        mel.connect_material_property(sub, "", unreal.MaterialProperty.MP_SUBSURFACE_COLOR)
    rug = no(mat, unreal.MaterialExpressionClamp, -500, 600)
    rug.set_editor_property("min_default", 0.45)
    rug.set_editor_property("max_default", 1.0)
    mel.connect_material_expressions(mr, "G", rug, "")
    mel.connect_material_property(rug, "", unreal.MaterialProperty.MP_ROUGHNESS)
    if vento:
        t = no(mat, unreal.MaterialExpressionTime, -900, 1100)
        obj = no(mat, unreal.MaterialExpressionObjectPositionWS, -900, 1250)
        wp = no(mat, unreal.MaterialExpressionWorldPosition, -900, 1400)
        alt = no(mat, unreal.MaterialExpressionSubtract, -700, 1400)
        mel.connect_material_expressions(wp, "", alt, "A")
        mel.connect_material_expressions(obj, "", alt, "B")
        zc = no(mat, unreal.MaterialExpressionComponentMask, -550, 1400)
        for c in "rgba":
            zc.set_editor_property(c, c == "b")
        mel.connect_material_expressions(alt, "", zc, "")
        k = mult(mat, zc, const(mat, 1.0 / 40.0, -700, 1500), -400, 1400)   # plantas baixas: o balanço sobe em ~40 cm
        k2 = mult(mat, k, k, -250, 1400)
        ox = no(mat, unreal.MaterialExpressionComponentMask, -700, 1250)
        for c in "rgba":
            ox.set_editor_property(c, c == "r")
        mel.connect_material_expressions(obj, "", ox, "")
        fase = mult(mat, ox, const(mat, 0.013, -550, 1250), -400, 1250)
        vel = mult(mat, t, const(mat, 1.9, -700, 1100), -550, 1100)
        soma = no(mat, unreal.MaterialExpressionAdd, -250, 1150)
        mel.connect_material_expressions(vel, "", soma, "A")
        mel.connect_material_expressions(fase, "", soma, "B")
        sn = no(mat, unreal.MaterialExpressionSine, -100, 1150)
        mel.connect_material_expressions(soma, "", sn, "")
        amp = no(mat, unreal.MaterialExpressionScalarParameter, -100, 1300)
        amp.set_editor_property("parameter_name", "VentoAmplitude")
        amp.set_editor_property("default_value", 5.0)
        desloc = mult(mat, mult(mat, sn, k2, 50, 1150), amp, 200, 1150)
        dir_ = no(mat, unreal.MaterialExpressionConstant3Vector, 200, 1300)
        dir_.set_editor_property("constant", unreal.LinearColor(0.8, 0.45, 0.0, 0.0))
        mel.connect_material_property(mult(mat, desloc, dir_, 400, 1200), "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def main():
    folha = mestre("M_Vegetal", True, True)
    mestre("M_Folha", True, False)   # folhas das árvores com Nanite: sem vento (Nanite + WPO travou a GPU), ver u2_arvore.py
    rocha = mestre("M_Rocha", False, False)
    n = 0
    for a in reg.get_assets_by_path("/Game/Vegetacao", recursive=True):
        if str(a.asset_class_path.asset_name) != "MaterialInstanceConstant":
            continue
        try:
            mi = a.get_asset()
            pasta = str(a.package_name)
            if "_tree_" in pasta:
                continue   # árvores com Nanite: materiais em u2_arvore.py (sem vento)
            mi.set_editor_property("parent", rocha if "boulder" in pasta else folha)
            for tp in mi.get_editor_property("texture_parameter_values"):
                nome = str(tp.parameter_info.name)
                tex = tp.parameter_value
                if not tex:
                    continue
                if nome == "NormalTexture":
                    tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                    tex.set_editor_property("srgb", False)
                elif nome == "MetallicRoughnessTexture":
                    tex.set_editor_property("srgb", False)
                unreal.EditorAssetLibrary.save_loaded_asset(tex)
            unreal.EditorAssetLibrary.save_loaded_asset(mi)
            unreal.log("AOE_VEGMAT %s params=%s" % (pasta, [str(t.parameter_info.name) for t in mi.get_editor_property("texture_parameter_values")]))
            n += 1
        except Exception:
            unreal.log_error("AOE_VEGMAT FALHOU %s\n%s" % (a.package_name, traceback.format_exc()))
    unreal.log("AOE_VEGMAT %d materiais trocados" % n)


main()
