# U1: material próprio do mar (/Game/Terreno/M_Mar): translúcido, 4 ondas senoidais cruzadas (normal analítica, sem textura),
# cor por profundidade (DepthFade), espuma pulsando na margem. Substitui o WaterBodyCustom (sem ondas) num plano simples.
import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
CAMINHO = "/Game/Terreno/M_Mar"

CODIGO = """
float2 p = P.xy;
float t = T;
float2 d1 = float2(0.80, 0.60);  float k1 = 0.0035;
float2 d2 = float2(-0.50, 0.86); float k2 = 0.0062;
float2 d3 = float2(0.20, -0.98); float k3 = 0.0110;
float2 d4 = float2(-0.90, -0.43);float k4 = 0.0210;
float c1 = cos(k1 * dot(d1, p) + 0.55 * t) * k1 * 1.00;
float c2 = cos(k2 * dot(d2, p) + 0.80 * t) * k2 * 0.70;
float c3 = cos(k3 * dot(d3, p) + 1.10 * t) * k3 * 0.28;
float c4 = cos(k4 * dot(d4, p) + 1.60 * t) * k4 * 0.10;
float2 g = (d1 * c1 + d2 * c2 + d3 * c3 + d4 * c4) * 15.0;
// micro-ondas: duas camadas de ruído deslizando em sentidos diferentes (diferença finita = inclinação). Sem elas o sol
// refletia em manchas brancas grandes; com elas vira cintilação miúda
float2 u1 = p / 380.0 + t * float2(0.010, 0.006);
float2 u2 = p / 210.0 + t * float2(-0.007, 0.011);
float e = 0.004;
float a0 = Texture2DSample(Ruido, RuidoSampler, u1).r + 0.7 * Texture2DSample(Ruido, RuidoSampler, u2).r;
float ax = Texture2DSample(Ruido, RuidoSampler, u1 + float2(e, 0)).r + 0.7 * Texture2DSample(Ruido, RuidoSampler, u2 + float2(e, 0)).r;
float ay = Texture2DSample(Ruido, RuidoSampler, u1 + float2(0, e)).r + 0.7 * Texture2DSample(Ruido, RuidoSampler, u2 + float2(0, e)).r;
g += float2(ax - a0, ay - a0) / e * 0.0045;
float3 n = normalize(float3(-g.x, -g.y, 1.0));
float shore = 1.0 - saturate(Dfoam);
float pulso = 0.5 + 0.5 * sin(t * 1.3 - Dfoam * 22.0 + dot(p, float2(0.004, 0.003)));
float foam = smoothstep(0.80, 0.98, shore * (0.75 + 0.45 * pulso)) * (1.0 - smoothstep(0.97, 1.0, shore));
return float4(n, foam);
"""


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def const3(mat, r, g, b, x, y):
    n = no(mat, unreal.MaterialExpressionConstant3Vector, x, y)
    n.set_editor_property("constant", unreal.LinearColor(r, g, b, 1.0))
    return n


def const(mat, v, x, y):
    n = no(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", v)
    return n


def depth(mat, dist, x, y):
    n = no(mat, unreal.MaterialExpressionDepthFade, x, y)
    n.set_editor_property("fade_distance_default", dist)
    mel.connect_material_expressions(const(mat, 1.0, x - 200, y), "", n, "InOpacity")
    return n


def main():
    if unreal.EditorAssetLibrary.does_asset_exist(CAMINHO):
        unreal.EditorAssetLibrary.delete_asset(CAMINHO)
    mat = tools.create_asset("M_Mar", "/Game/Terreno", unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("two_sided", True)
    mat.set_editor_property("translucency_lighting_mode", unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)

    wp = no(mat, unreal.MaterialExpressionWorldPosition, -1200, 0)
    tm = no(mat, unreal.MaterialExpressionTime, -1200, 200)
    dfoam = depth(mat, 150.0, -1000, 400)
    dcor = depth(mat, 1600.0, -1000, 600)

    c = no(mat, unreal.MaterialExpressionCustom, -700, 100)
    c.set_editor_property("code", CODIGO)
    c.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT4)
    entradas = []
    for nome in ("P", "T", "Dfoam", "Ruido"):
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", nome)
        entradas.append(ci)
    c.set_editor_property("inputs", entradas)
    mel.connect_material_expressions(wp, "", c, "P")
    mel.connect_material_expressions(tm, "", c, "T")
    mel.connect_material_expressions(dfoam, "", c, "Dfoam")
    rt = no(mat, unreal.MaterialExpressionTextureObject, -1000, 800)
    rt.set_editor_property("texture", unreal.load_asset("/Game/Time/T_Ruido"))
    rt.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
    mel.connect_material_expressions(rt, "", c, "Ruido")

    nrm = no(mat, unreal.MaterialExpressionComponentMask, -450, 0)
    for k in "rgba":
        nrm.set_editor_property(k, k in "rgb")
    mel.connect_material_expressions(c, "", nrm, "")
    foam = no(mat, unreal.MaterialExpressionComponentMask, -450, 200)
    for k in "rgba":
        foam.set_editor_property(k, k == "a")
    mel.connect_material_expressions(c, "", foam, "")

    raso = no(mat, unreal.MaterialExpressionVectorParameter, -450, 400)   # bioma: CorRaso / CorFundo
    raso.set_editor_property("parameter_name", "CorRaso")
    raso.set_editor_property("default_value", unreal.LinearColor(0.03, 0.42, 0.48, 1.0))
    fundo = no(mat, unreal.MaterialExpressionVectorParameter, -450, 500)
    fundo.set_editor_property("parameter_name", "CorFundo")
    fundo.set_editor_property("default_value", unreal.LinearColor(0.008, 0.12, 0.20, 1.0))
    cor = no(mat, unreal.MaterialExpressionLinearInterpolate, -200, 400)
    mel.connect_material_expressions(raso, "", cor, "A")
    mel.connect_material_expressions(fundo, "", cor, "B")
    mel.connect_material_expressions(dcor, "", cor, "Alpha")   # DepthFade: 0 na margem, 1 longe dela

    branco = const3(mat, 0.9, 0.95, 0.95, -200, 600)
    cor2 = no(mat, unreal.MaterialExpressionLinearInterpolate, 0, 400)
    mel.connect_material_expressions(cor, "", cor2, "A")
    mel.connect_material_expressions(branco, "", cor2, "B")
    mel.connect_material_expressions(foam, "", cor2, "Alpha")

    op = no(mat, unreal.MaterialExpressionLinearInterpolate, 0, 700)
    mel.connect_material_expressions(const(mat, 0.72, -200, 700), "", op, "A")
    mel.connect_material_expressions(const(mat, 0.96, -200, 780), "", op, "B")
    mel.connect_material_expressions(dcor, "", op, "Alpha")
    op2 = no(mat, unreal.MaterialExpressionMax, 200, 700)
    mel.connect_material_expressions(op, "", op2, "A")
    mel.connect_material_expressions(foam, "", op2, "B")

    mel.connect_material_property(cor2, "", unreal.MaterialProperty.MP_BASE_COLOR)
    # lava (bioma submundo): a cor do mar tambem emite, escalada por BrilhoMar (0 = sem emissao)
    bm = no(mat, unreal.MaterialExpressionScalarParameter, 0, 900)
    bm.set_editor_property("parameter_name", "BrilhoMar")
    bm.set_editor_property("default_value", 0.0)
    emi = no(mat, unreal.MaterialExpressionMultiply, 200, 900)
    mel.connect_material_expressions(cor, "", emi, "A")
    mel.connect_material_expressions(bm, "", emi, "B")
    mel.connect_material_property(emi, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.connect_material_property(nrm, "", unreal.MaterialProperty.MP_NORMAL)
    mel.connect_material_property(const(mat, 0.14, 200, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(const(mat, 0.4, 200, 300), "", unreal.MaterialProperty.MP_SPECULAR)
    mel.connect_material_property(op2, "", unreal.MaterialProperty.MP_OPACITY)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    unreal.log("AOE_MAR ok")


main()
