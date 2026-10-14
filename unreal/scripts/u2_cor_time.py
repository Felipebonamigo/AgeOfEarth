# U2: materiais da cor de time com cara de jogo realista (no lugar do disco chapado e da placa no poste):
#   /Game/Time/M_Anel        anel fino translúcido no chão sob a unidade (UV radial do Plane), parâmetros Color e Sel
#   /Game/Time/M_Estandarte  pano do estandarte: cor do dono com trama e barra dourada, ondulando ao vento (WPO), dupla face
#   /Game/Time/M_Mastro      madeira escura do mastro
# Uso (editor FECHADO): unreal/scripts/ue.sh u2_cor_time.py /tmp/time.log
import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
PASTA = "/Game/Time"


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def const(mat, v, x, y):
    n = no(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", v)
    return n


def vec(mat, r, g, b, x, y):
    n = no(mat, unreal.MaterialExpressionConstant3Vector, x, y)
    n.set_editor_property("constant", unreal.LinearColor(r, g, b, 1.0))
    return n


def custom(mat, codigo, entradas, saida, x, y):
    c = no(mat, unreal.MaterialExpressionCustom, x, y)
    c.set_editor_property("code", codigo)
    c.set_editor_property("output_type", saida)
    lista = []
    for nome in entradas:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", nome)
        lista.append(ci)
    c.set_editor_property("inputs", lista)
    return c


def novo(nome):
    caminho = PASTA + "/" + nome
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        unreal.EditorAssetLibrary.delete_asset(caminho)
    return tools.create_asset(nome, PASTA, unreal.Material, unreal.MaterialFactoryNew())


def param_cor(mat, x, y):
    p = no(mat, unreal.MaterialExpressionVectorParameter, x, y)
    p.set_editor_property("parameter_name", "Color")
    p.set_editor_property("default_value", unreal.LinearColor(0.1, 0.3, 0.9, 1.0))
    return p


def anel():
    mat = novo("M_Anel")
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("two_sided", True)
    uv = no(mat, unreal.MaterialExpressionTextureCoordinate, -900, 200)
    sel = no(mat, unreal.MaterialExpressionScalarParameter, -900, 350)
    sel.set_editor_property("parameter_name", "Sel")
    sel.set_editor_property("default_value", 0.0)
    # anel: borda fina e nítida, miolo quase invisível; selecionada = anel mais largo e mais vivo
    c = custom(mat, """
float d = length(UV - 0.5) * 2.0;
float w = lerp(0.10, 0.16, Sel);
float anel = smoothstep(1.0 - w - 0.05, 1.0 - w, d) * (1.0 - smoothstep(0.93, 1.0, d));
float miolo = (1.0 - smoothstep(0.0, 1.0 - w, d)) * lerp(0.025, 0.12, Sel);
return anel * lerp(0.75, 1.0, Sel) + miolo;
""", ["UV", "Sel"], unreal.CustomMaterialOutputType.CMOT_FLOAT1, -600, 250)
    mel.connect_material_expressions(uv, "", c, "UV")
    mel.connect_material_expressions(sel, "", c, "Sel")
    cor = param_cor(mat, -600, 0)
    brilho = no(mat, unreal.MaterialExpressionMultiply, -300, 0)
    mel.connect_material_expressions(cor, "", brilho, "A")
    mel.connect_material_expressions(const(mat, 0.9, -450, 100), "", brilho, "B")
    mel.connect_material_property(brilho, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_OPACITY)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


def estandarte():
    mat = novo("M_Estandarte")
    mat.set_editor_property("two_sided", True)
    uv = no(mat, unreal.MaterialExpressionTextureCoordinate, -900, 200)
    cor = param_cor(mat, -900, 0)
    # trama do tecido + barra dourada na borda livre + leve escurecimento no pé
    c = custom(mat, """
float trama = 0.86 + 0.14 * (0.5 + 0.5 * sin(UV.x * 420.0)) * (0.5 + 0.5 * sin(UV.y * 380.0));
float barra = step(0.86, UV.x) * (1.0 - step(0.94, UV.x)) + step(0.92, UV.y) + (1.0 - step(0.08, UV.y));
barra = saturate(barra);
float3 dourado = float3(0.62, 0.45, 0.14);
float3 base = Cor * trama * lerp(0.85, 1.0, UV.y);
return lerp(base, dourado, barra);
""", ["UV", "Cor"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -600, 100)
    mel.connect_material_expressions(uv, "", c, "UV")
    mel.connect_material_expressions(cor, "RGB", c, "Cor")
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(const(mat, 0.85, -300, 300), "", unreal.MaterialProperty.MP_ROUGHNESS)
    # vento: a ponta livre (UV.x = 1) ondula, a borda presa ao mastro (UV.x = 0) fica parada; desloca ao longo da normal
    t = no(mat, unreal.MaterialExpressionTime, -900, 500)
    nrm = no(mat, unreal.MaterialExpressionVertexNormalWS, -900, 650)
    obj = no(mat, unreal.MaterialExpressionObjectPositionWS, -900, 800)
    w = custom(mat, """
float fase = dot(Obj.xy, float2(0.013, 0.017));
float onda = sin(T * 3.1 + UV.x * 7.0 + fase) * 0.7 + sin(T * 5.3 + UV.x * 13.0 + UV.y * 3.0 + fase) * 0.3;
return N * onda * UV.x * 9.0;
""", ["T", "UV", "N", "Obj"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -600, 600)
    mel.connect_material_expressions(t, "", w, "T")
    mel.connect_material_expressions(uv, "", w, "UV")
    mel.connect_material_expressions(nrm, "", w, "N")
    mel.connect_material_expressions(obj, "", w, "Obj")
    mel.connect_material_property(w, "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


def mastro():
    mat = novo("M_Mastro")
    mel.connect_material_property(vec(mat, 0.16, 0.10, 0.055, -300, 0), "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(const(mat, 0.75, -300, 150), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


unreal.EditorAssetLibrary.make_directory(PASTA)
anel()
estandarte()
mastro()
unreal.log("AOE_TIME ok")


def ruido():
    """Importa Content/Fontes/fx/T_Ruido.png (gerada por u2_ruido.mjs) como textura linear de máscara."""
    import os
    caminho = PASTA + "/T_Ruido"
    arq = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "AgeOfEarthUE", "Content", "Fontes", "fx", "T_Ruido.png"))
    tk = unreal.AssetImportTask()
    tk.set_editor_property("filename", arq)
    tk.set_editor_property("destination_path", PASTA)
    tk.set_editor_property("destination_name", "T_Ruido")
    tk.set_editor_property("automated", True)
    tk.set_editor_property("replace_existing", True)
    tk.set_editor_property("save", True)
    tools.import_asset_tasks([tk])
    tex = unreal.load_asset(caminho)
    tex.set_editor_property("srgb", False)
    tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
    unreal.EditorAssetLibrary.save_loaded_asset(tex)
    return tex


def poeira():
    """Nuvem de poeira/fumaça (instâncias de esfera; PerInstanceCustomData 0 = opacidade, 1 = escuridão): ruído fBm em duas
    escalas rolando com o tempo recorta a esfera em fiapos; borda pela fresnel e DepthFade no chão (sem corte duro)."""
    tex = ruido()
    mat = novo("M_Poeira")
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    d0 = no(mat, unreal.MaterialExpressionPerInstanceCustomData, -1100, 300)
    d0.set_editor_property("data_index", 0)
    d1 = no(mat, unreal.MaterialExpressionPerInstanceCustomData, -1100, 450)
    d1.set_editor_property("data_index", 1)
    fr = no(mat, unreal.MaterialExpressionFresnel, -1100, 150)
    wp = no(mat, unreal.MaterialExpressionWorldPosition, -1100, 600)
    tm = no(mat, unreal.MaterialExpressionTime, -1100, 750)
    st = unreal.MaterialSamplerType
    # duas amostras da mesma textura em escalas e direções diferentes (UV vindo da posição no mundo, plano XZ + YZ)
    uv = custom(mat, "return float4(P.x * 0.0021 + P.z * 0.0013 + T * 0.020, P.y * 0.0021 - P.z * 0.0017, P.x * 0.0057 - T * 0.035, P.y * 0.0049 + P.z * 0.0041);", ["P", "T"], unreal.CustomMaterialOutputType.CMOT_FLOAT4, -850, 650)
    mel.connect_material_expressions(wp, "", uv, "P")
    mel.connect_material_expressions(tm, "", uv, "T")
    m1 = no(mat, unreal.MaterialExpressionComponentMask, -650, 600)
    for k in "rgba":
        m1.set_editor_property(k, k in "rg")
    mel.connect_material_expressions(uv, "", m1, "")
    m2 = no(mat, unreal.MaterialExpressionComponentMask, -650, 750)
    for k in "rgba":
        m2.set_editor_property(k, k in "ba")
    mel.connect_material_expressions(uv, "", m2, "")
    s1 = no(mat, unreal.MaterialExpressionTextureSample, -450, 600)
    s1.set_editor_property("texture", tex)
    s1.set_editor_property("sampler_type", st.SAMPLERTYPE_MASKS)
    mel.connect_material_expressions(m1, "", s1, "UVs")
    s2 = no(mat, unreal.MaterialExpressionTextureSample, -450, 800)
    s2.set_editor_property("texture", tex)
    s2.set_editor_property("sampler_type", st.SAMPLERTYPE_MASKS)
    mel.connect_material_expressions(m2, "", s2, "UVs")
    df = no(mat, unreal.MaterialExpressionDepthFade, -450, 1000)
    df.set_editor_property("fade_distance_default", 60.0)
    mel.connect_material_expressions(const(mat, 1.0, -650, 1000), "", df, "InOpacity")
    c = custom(mat, """
float borda = pow(saturate(1.0 - F), 1.3);
float n = N1 * 0.65 + N2 * 0.35;
float fiapo = smoothstep(0.30 + (1.0 - borda) * 0.35, 0.75, n);
return saturate(A * fiapo * borda * 1.1 * D);
""", ["F", "A", "N1", "N2", "D"], unreal.CustomMaterialOutputType.CMOT_FLOAT1, -200, 300)
    mel.connect_material_expressions(fr, "", c, "F")
    mel.connect_material_expressions(d0, "", c, "A")
    mel.connect_material_expressions(s1, "R", c, "N1")
    mel.connect_material_expressions(s2, "R", c, "N2")
    mel.connect_material_expressions(df, "", c, "D")
    cor = custom(mat, "return lerp(float3(0.52, 0.45, 0.35), float3(0.16, 0.15, 0.14), saturate(E)) * (0.85 + 0.3 * N);", ["E", "N"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -200, 0)
    mel.connect_material_expressions(d1, "", cor, "E")
    mel.connect_material_expressions(s1, "R", cor, "N")
    mel.connect_material_property(cor, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_OPACITY)
    mel.connect_material_property(const(mat, 1.0, 0, 400), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    m = unreal.load_asset(PASTA + "/M_Mastro")
    m.set_editor_property("used_with_instanced_static_meshes", True)
    mel.recompile_material(m)
    unreal.EditorAssetLibrary.save_loaded_asset(m)


poeira()
unreal.log("AOE_POEIRA ok")


def fogo():
    """Chamas para edifício danificado: aditivo, sem luz própria; ruído rolando para cima recorta línguas de fogo numa esfera
    achatada (PerInstanceCustomData 0 = intensidade)."""
    tex = unreal.load_asset(PASTA + "/T_Ruido")
    mat = novo("M_Fogo")
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    d0 = no(mat, unreal.MaterialExpressionPerInstanceCustomData, -1100, 300)
    d0.set_editor_property("data_index", 0)
    wp = no(mat, unreal.MaterialExpressionWorldPosition, -1100, 500)
    lp = no(mat, unreal.MaterialExpressionLocalPosition, -1100, 650)
    tm = no(mat, unreal.MaterialExpressionTime, -1100, 800)
    fr = no(mat, unreal.MaterialExpressionFresnel, -1100, 150)
    uv = custom(mat, "return float2(P.x * 0.006 + P.y * 0.004, P.z * 0.006 - T * 0.9);", ["P", "T"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -850, 600)
    mel.connect_material_expressions(wp, "", uv, "P")
    mel.connect_material_expressions(tm, "", uv, "T")
    s = no(mat, unreal.MaterialExpressionTextureSample, -600, 600)
    s.set_editor_property("texture", tex)
    s.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
    mel.connect_material_expressions(uv, "", s, "UVs")
    c = custom(mat, """
float alt = saturate(L.z / 50.0 * 0.5 + 0.5);           // 0 na base da esfera, 1 no topo
float borda = pow(saturate(1.0 - F), 1.2);
float chama = smoothstep(0.35 + alt * 0.45, 0.85, N) * borda * (1.0 - alt * 0.6);
float3 cor = lerp(float3(1.0, 0.75, 0.25), float3(0.9, 0.22, 0.03), alt);
return cor * chama * A * 6.0;
""", ["L", "F", "N", "A"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -300, 300)
    mel.connect_material_expressions(lp, "", c, "L")
    mel.connect_material_expressions(fr, "", c, "F")
    mel.connect_material_expressions(s, "R", c, "N")
    mel.connect_material_expressions(d0, "", c, "A")
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


fogo()
unreal.log("AOE_FOGO ok")


def raio():
    """Raio de Zeus e brilho divino: aditivo, sem luz, cor por instância (PerInstanceCustomData 0..2 = RGB, 3 = intensidade)."""
    mat = novo("M_Raio")
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    ds = []
    for i in range(4):
        d = no(mat, unreal.MaterialExpressionPerInstanceCustomData, -900, 100 + i * 120)
        d.set_editor_property("data_index", i)
        ds.append(d)
    fr = no(mat, unreal.MaterialExpressionFresnel, -900, -100)
    c = custom(mat, "float nucleo = pow(saturate(1.0 - F), 2.5); return float3(R, G, B) * (0.25 + nucleo * 3.0) * I * 12.0;",
               ["F", "R", "G", "B", "I"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -500, 100)
    mel.connect_material_expressions(fr, "", c, "F")
    for nome, d in zip(("R", "G", "B", "I"), ds):
        mel.connect_material_expressions(d, "", c, nome)
    mel.connect_material_property(c, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


raio()
unreal.log("AOE_RAIO ok")
