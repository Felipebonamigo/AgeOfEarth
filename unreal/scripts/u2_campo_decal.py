# U2: campo de cultivo como DECAL projetado no terreno (/Game/Meshy/M_CampoDecal), no lugar do plano M_Campo.
# O plano flutuava sobre o Landscape e, de longe, o terreno simplificado (LOD) furava o plano: a lavoura "piscava". O decal
# segue o chão em qualquer distância. As fileiras são antisserrilhadas (fwidth): de longe viram o tom médio em vez de tremer.
# Bordas com leve esmaecimento (sem recorte duro). Editor FECHADO: unreal/scripts/ue.sh u2_campo_decal.py /tmp/campo.log
import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
TEX = "/Game/Terreno/Texturas/"
CAMINHO = "/Game/Meshy/M_CampoDecal"


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def amostra(mat, tex, tipo, uv, x, y):
    s = no(mat, unreal.MaterialExpressionTextureSample, x, y)
    s.set_editor_property("texture", unreal.load_asset(TEX + tex))
    s.set_editor_property("sampler_type", tipo)
    mel.connect_material_expressions(uv, "", s, "UVs")
    return s


if unreal.EditorAssetLibrary.does_asset_exist(CAMINHO):
    unreal.EditorAssetLibrary.delete_asset(CAMINHO)
mat = tools.create_asset("M_CampoDecal", "/Game/Meshy", unreal.Material, unreal.MaterialFactoryNew())
mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_DEFERRED_DECAL)
mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
st = unreal.MaterialSamplerType
uv0 = no(mat, unreal.MaterialExpressionTextureCoordinate, -1400, 0)
uv3 = no(mat, unreal.MaterialExpressionTextureCoordinate, -1400, 200)
uv3.set_editor_property("u_tiling", 3.0)
uv3.set_editor_property("v_tiling", 3.0)
solo = amostra(mat, "brown_mud_dry_Diffuse", st.SAMPLERTYPE_COLOR, uv3, -1100, -200)
nor = amostra(mat, "brown_mud_dry_nor_gl", st.SAMPLERTYPE_NORMAL, uv3, -1100, 150)

c = no(mat, unreal.MaterialExpressionCustom, -700, 0)
c.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT4)
c.set_editor_property("code", """
// 14 fileiras por campo ao longo de V; contraste some quando a fileira fica menor que ~2 pixels (sem tremer de longe)
float f = UV.y * 14.0;
float w = fwidth(f);
float fade = saturate(1.0 - (w - 0.25) / 0.35);
float s = sin(f * 6.2831853);
float sulco = saturate(s * 2.2 + 0.5);
float media = 0.55;
sulco = lerp(media, sulco, fade);
float3 lavoura = lerp(float3(0.19, 0.30, 0.05), float3(0.42, 0.34, 0.08), lerp(0.5, s * s, fade));
float3 terra = Solo * float3(0.55, 0.45, 0.35);
float3 cor = lerp(terra, lavoura, sulco);
// borda: esmaece nos ultimos 6% de cada lado
float2 b = min(UV, 1.0 - UV);
float borda = saturate(min(b.x, b.y) / 0.06);
return float4(cor, borda);
""")
entradas = []
for nome in ("UV", "Solo"):
    ci = unreal.CustomInput()
    ci.set_editor_property("input_name", nome)
    entradas.append(ci)
c.set_editor_property("inputs", entradas)
mel.connect_material_expressions(uv0, "", c, "UV")
mel.connect_material_expressions(solo, "RGB", c, "Solo")
rgb = no(mat, unreal.MaterialExpressionComponentMask, -400, 0)
for k in "rgba":
    rgb.set_editor_property(k, k in "rgb")
mel.connect_material_expressions(c, "", rgb, "")
a = no(mat, unreal.MaterialExpressionComponentMask, -400, 150)
for k in "rgba":
    a.set_editor_property(k, k == "a")
mel.connect_material_expressions(c, "", a, "")
rug = no(mat, unreal.MaterialExpressionConstant, -400, 300)
rug.set_editor_property("r", 0.9)
mel.connect_material_property(rgb, "", unreal.MaterialProperty.MP_BASE_COLOR)
mel.connect_material_property(nor, "RGB", unreal.MaterialProperty.MP_NORMAL)
mel.connect_material_property(rug, "", unreal.MaterialProperty.MP_ROUGHNESS)
mel.connect_material_property(a, "", unreal.MaterialProperty.MP_OPACITY)
mel.recompile_material(mat)
unreal.EditorAssetLibrary.save_loaded_asset(mat)
unreal.log("AOE_CAMPODECAL ok")
