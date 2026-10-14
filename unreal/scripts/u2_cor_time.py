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
