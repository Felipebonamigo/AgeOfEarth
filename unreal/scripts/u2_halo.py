# U2: /Game/Time/M_Halo — halo dos poderes no chão (num plano): aditivo, sem luz, degradê radial com um anel mais forte na
# borda e cintilação pelo ruído; cor por instância (PerInstanceCustomData 0..2 = RGB, 3 = intensidade), como o M_Raio.
# O M_Raio num cilindro achatado virava um disco chapado de cor. Editor FECHADO: unreal/scripts/ue.sh u2_halo.py /tmp/halo.log
import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
CAMINHO = "/Game/Time/M_Halo"


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


if unreal.EditorAssetLibrary.does_asset_exist(CAMINHO):
    unreal.EditorAssetLibrary.delete_asset(CAMINHO)
mat = tools.create_asset("M_Halo", "/Game/Time", unreal.Material, unreal.MaterialFactoryNew())
mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
mat.set_editor_property("used_with_instanced_static_meshes", True)
mat.set_editor_property("two_sided", True)
ds = []
for i in range(4):
    d = no(mat, unreal.MaterialExpressionPerInstanceCustomData, -900, 100 + i * 120)
    d.set_editor_property("data_index", i)
    ds.append(d)
uv = no(mat, unreal.MaterialExpressionTextureCoordinate, -900, -200)
wp = no(mat, unreal.MaterialExpressionWorldPosition, -1100, -400)
tm = no(mat, unreal.MaterialExpressionTime, -1100, -550)
ruido = no(mat, unreal.MaterialExpressionTextureObject, -1100, -700)
ruido.set_editor_property("texture", unreal.load_asset("/Game/Time/T_Ruido"))
ruido.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
c = no(mat, unreal.MaterialExpressionCustom, -450, 100)
c.set_editor_property("code", """
float2 d = UV - 0.5;
float r = length(d) * 2.0;                                  // 0 no centro, 1 na borda do plano
float dentro = saturate((1.0 - r) * 12.0);
float anel = exp(-pow((r - 0.9) / 0.05, 2.0));               // anel fino perto da borda
float miolo = pow(saturate(1.0 - r), 1.6) * 0.28;            // véu suave para dentro
float n = Texture2DSample(Ruido, RuidoSampler, P.xy / 600.0 + T * float2(0.02, 0.013)).r;
float cint = 0.65 + 0.7 * n;                                  // cintila, não é chapado
return float3(R, G, B) * (anel * 1.6 + miolo) * cint * dentro * I * 10.0;
""")
c.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
ins = []
for n in ("UV", "P", "T", "Ruido", "R", "G", "B", "I"):
    ci = unreal.CustomInput()
    ci.set_editor_property("input_name", n)
    ins.append(ci)
c.set_editor_property("inputs", ins)
mel.connect_material_expressions(uv, "", c, "UV")
mel.connect_material_expressions(wp, "", c, "P")
mel.connect_material_expressions(tm, "", c, "T")
mel.connect_material_expressions(ruido, "", c, "Ruido")
for nome, d in zip(("R", "G", "B", "I"), ds):
    mel.connect_material_expressions(d, "", c, nome)
mel.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
mel.recompile_material(mat)
unreal.EditorAssetLibrary.save_loaded_asset(mat)
unreal.log("AOE_HALO ok")
