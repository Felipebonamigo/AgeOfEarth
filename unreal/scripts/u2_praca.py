# U2: praça calçada sob cada edifício (referência do dono: cidades do Rise of Kingdoms, edifícios sobre lajotas de pedra clara).
#   /Game/Time/M_PracaDecal  decal no chão: lajotas de granito (Poly Haven rock_tile_floor, CC0) em coordenadas de mundo (sem emenda
#                            entre praças vizinhas), borda irregular pelo ruído (some na grama em vez de recorte reto)
#   /Game/Time/MI_Pedra      pedra talhada para o canteiro de obras (blocos empilhados), instanciável
# Editor FECHADO: unreal/scripts/ue.sh u2_praca.py /tmp/praca.log
import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
TEX = "/Game/Terreno/Texturas/"
PASTA = "/Game/Time"


def no(mat, cls, x, y):
    return mel.create_material_expression(mat, cls, x, y)


def custom(mat, codigo, entradas, saida, x, y):
    c = no(mat, unreal.MaterialExpressionCustom, x, y)
    c.set_editor_property("code", codigo)
    c.set_editor_property("output_type", saida)
    lst = []
    for n in entradas:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", n)
        lst.append(ci)
    c.set_editor_property("inputs", lst)
    return c


def amostra(mat, tex, tipo, uv, x, y):
    s = no(mat, unreal.MaterialExpressionTextureSample, x, y)
    s.set_editor_property("texture", unreal.load_asset(TEX + tex) if "/" not in tex else unreal.load_asset(tex))
    s.set_editor_property("sampler_type", tipo)
    if uv is not None:
        mel.connect_material_expressions(uv, "", s, "UVs")
    return s


def novo(nome):
    caminho = PASTA + "/" + nome
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        unreal.EditorAssetLibrary.delete_asset(caminho)
    return tools.create_asset(nome, PASTA, unreal.Material, unreal.MaterialFactoryNew())


def praca():
    mat = novo("M_PracaDecal")
    mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_DEFERRED_DECAL)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    st = unreal.MaterialSamplerType
    wp = no(mat, unreal.MaterialExpressionWorldPosition, -1400, 0)
    uvw = custom(mat, "return P.xy / 260.0;", ["P"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -1200, 0)
    mel.connect_material_expressions(wp, "", uvw, "P")
    cor = amostra(mat, "rock_tile_floor_Diffuse", st.SAMPLERTYPE_COLOR, uvw, -900, -200)
    nor = amostra(mat, "rock_tile_floor_nor_gl", st.SAMPLERTYPE_NORMAL, uvw, -900, 100)
    rug = amostra(mat, "rock_tile_floor_Rough", st.SAMPLERTYPE_MASKS, uvw, -900, 400)
    uv0 = no(mat, unreal.MaterialExpressionTextureCoordinate, -1400, 600)
    uvr = custom(mat, "return P.xy / 900.0;", ["P"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -1200, 750)
    mel.connect_material_expressions(wp, "", uvr, "P")
    ruido = amostra(mat, "/Game/Time/T_Ruido", st.SAMPLERTYPE_MASKS, uvr, -900, 700)
    borda = custom(mat, """
float2 b = min(UV, 1.0 - UV);
float d = min(b.x, b.y);                       // 0 na borda, 0.5 no centro
float limite = 0.06 + N * 0.10;                 // borda irregular
return saturate((d - limite * 0.5) / max(limite, 0.01));
""", ["UV", "N"], unreal.CustomMaterialOutputType.CMOT_FLOAT1, -500, 600)
    mel.connect_material_expressions(uv0, "", borda, "UV")
    mel.connect_material_expressions(ruido, "R", borda, "N")
    # tom: lajota um pouco mais quente e clara (pedra de calcário ao sol), com sujeira nas juntas pela variação do ruído
    tom = custom(mat, "return C * float3(1.45, 1.36, 1.18) * (0.88 + 0.24 * N);   // calcário claro e quente", ["C", "N"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -500, -200)
    mel.connect_material_expressions(cor, "RGB", tom, "C")
    mel.connect_material_expressions(ruido, "R", tom, "N")
    mel.connect_material_property(tom, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(nor, "RGB", unreal.MaterialProperty.MP_NORMAL)
    mel.connect_material_property(rug, "R", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(borda, "", unreal.MaterialProperty.MP_OPACITY)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


def pedra():
    mat = novo("M_PedraTalhada")
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    st = unreal.MaterialSamplerType
    wp = no(mat, unreal.MaterialExpressionWorldPosition, -1200, 0)
    # projeção triplanar simples (o cubo do motor tem UV esticado): mistura XY/XZ/YZ pela normal
    nrm = no(mat, unreal.MaterialExpressionVertexNormalWS, -1200, 200)
    tex = unreal.load_asset(TEX + "rock_tile_floor_Diffuse")
    uvs = []
    for i, eixo in enumerate(("P.xy", "P.xz", "P.yz")):
        u = custom(mat, "return %s / 120.0;" % eixo, ["P"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -1000, -200 + i * 150)
        mel.connect_material_expressions(wp, "", u, "P")
        s = no(mat, unreal.MaterialExpressionTextureSample, -750, -200 + i * 150)
        s.set_editor_property("texture", tex)
        s.set_editor_property("sampler_type", st.SAMPLERTYPE_COLOR)
        mel.connect_material_expressions(u, "", s, "UVs")
        uvs.append(s)
    mix = custom(mat, "float3 w = abs(N); w /= (w.x + w.y + w.z); return (A * w.z + B * w.y + C * w.x) * float3(1.12, 1.07, 0.97);",
                 ["A", "B", "C", "N"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -450, 0)
    for nome, s in zip(("A", "B", "C"), uvs):
        mel.connect_material_expressions(s, "RGB", mix, nome)
    mel.connect_material_expressions(nrm, "", mix, "N")
    mel.connect_material_property(mix, "", unreal.MaterialProperty.MP_BASE_COLOR)
    r = no(mat, unreal.MaterialExpressionConstant, -450, 250)
    r.set_editor_property("r", 0.85)
    mel.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


praca()
pedra()
unreal.log("AOE_PRACA ok")
