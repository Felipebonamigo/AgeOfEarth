# U1: material do campo de cultivo (a "fazenda" da simulação é um plano arado, não uma casa) e correção dos mestres do Meshy
# para SkeletalMesh. Cria /Game/Meshy/M_Campo: terra arada (foto Poly Haven brown_mud_dry) com fileiras de lavoura verde-dourada.
# Uso: unreal/scripts/ue.sh u1_campo.py /tmp/campo.log
import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
TEX = "/Game/Terreno/Texturas/"


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def const(mat, v, x, y):
    n = no(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", v)
    return n


def mult(mat, a, b, x, y, ao="", bo=""):
    n = no(mat, unreal.MaterialExpressionMultiply, x, y)
    mel.connect_material_expressions(a, ao, n, "A")
    mel.connect_material_expressions(b, bo, n, "B")
    return n


def vetor(mat, r, g, b, x, y):
    n = no(mat, unreal.MaterialExpressionConstant3Vector, x, y)
    n.set_editor_property("constant", unreal.LinearColor(r, g, b, 1.0))
    return n


def main():
    # corrige os mestres do Meshy para SkeletalMesh (sem o flag as unidades caem no material padrão, escuras)
    for nome in ("M_Meshy", "M_Meshy_Vento"):
        m = unreal.load_asset("/Game/Meshy/" + nome)
        if m:
            m.set_editor_property("used_with_skeletal_mesh", True)
            mel.recompile_material(m)
            unreal.EditorAssetLibrary.save_loaded_asset(m)
            unreal.log("AOE_CAMPO flag skeletal em %s" % nome)

    caminho = "/Game/Meshy/M_Campo"
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        unreal.EditorAssetLibrary.delete_asset(caminho)
    mat = tools.create_asset("M_Campo", "/Game/Meshy", unreal.Material, unreal.MaterialFactoryNew())
    st = unreal.MaterialSamplerType
    uv = no(mat, unreal.MaterialExpressionTextureCoordinate, -1200, 0)
    uv.set_editor_property("u_tiling", 3.0)
    uv.set_editor_property("v_tiling", 3.0)
    solo = no(mat, unreal.MaterialExpressionTextureSample, -900, -200)
    solo.set_editor_property("texture", unreal.load_asset(TEX + "brown_mud_dry_Diffuse"))
    solo.set_editor_property("sampler_type", st.SAMPLERTYPE_COLOR)
    mel.connect_material_expressions(uv, "", solo, "UVs")
    nor = no(mat, unreal.MaterialExpressionTextureSample, -900, 100)
    nor.set_editor_property("texture", unreal.load_asset(TEX + "brown_mud_dry_nor_gl"))
    nor.set_editor_property("sampler_type", st.SAMPLERTYPE_NORMAL)
    mel.connect_material_expressions(uv, "", nor, "UVs")
    # fileiras: seno do V (aprox. 14 sulcos por campo), afiado
    cm = no(mat, unreal.MaterialExpressionComponentMask, -1000, 400)
    for c in "rgba":
        cm.set_editor_property(c, c == "g")
    uv0 = no(mat, unreal.MaterialExpressionTextureCoordinate, -1200, 400)
    mel.connect_material_expressions(uv0, "", cm, "")
    k = mult(mat, cm, const(mat, 6.2831853 * 14.0, -1000, 520), -800, 400)
    sn = no(mat, unreal.MaterialExpressionSine, -620, 400)
    mel.connect_material_expressions(k, "", sn, "")
    # 0..1 afiado: saturate(sin*2.2 + 0.5)
    af = mult(mat, sn, const(mat, 2.2, -620, 520), -460, 400)
    af2 = no(mat, unreal.MaterialExpressionAdd, -300, 400)
    mel.connect_material_expressions(af, "", af2, "A")
    mel.connect_material_expressions(const(mat, 0.5, -460, 520), "", af2, "B")
    sat = no(mat, unreal.MaterialExpressionSaturate, -150, 400)
    mel.connect_material_expressions(af2, "", sat, "")
    lav = vetor(mat, 0.19, 0.30, 0.05, -300, 150)   # lavoura verde-oliva
    ouro = vetor(mat, 0.42, 0.34, 0.08, -300, 250)  # espigas douradas
    mistura = no(mat, unreal.MaterialExpressionLinearInterpolate, -100, 200)
    mel.connect_material_expressions(lav, "", mistura, "A")
    mel.connect_material_expressions(ouro, "", mistura, "B")
    mel.connect_material_expressions(mult(mat, sn, sn, -300, 330), "", mistura, "Alpha")
    solo_esc = mult(mat, solo, vetor(mat, 0.55, 0.45, 0.35, -700, -50), -500, -150)
    cor = no(mat, unreal.MaterialExpressionLinearInterpolate, 100, 0)
    mel.connect_material_expressions(solo_esc, "", cor, "A")
    mel.connect_material_expressions(mistura, "", cor, "B")
    mel.connect_material_expressions(sat, "", cor, "Alpha")
    mel.connect_material_property(cor, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(nor, "RGB", unreal.MaterialProperty.MP_NORMAL)
    mel.connect_material_property(const(mat, 0.9, 100, 300), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    unreal.log("AOE_CAMPO ok")


main()
