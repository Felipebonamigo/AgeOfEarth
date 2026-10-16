# U2: praça calçada sob cada edifício (referência do dono: cidades do Rise of Kingdoms, edifícios sobre lajotas de pedra clara).
#   /Game/Time/M_PracaDecal  decal no chão: lajotas de granito (Poly Haven rock_tile_floor, CC0) em coordenadas de mundo (sem emenda
#                            entre praças vizinhas), borda irregular pelo ruído (some na grama em vez de recorte reto)
#   /Game/Time/M_EstradaDecal caminho de terra batida (Poly Haven brown_mud_dry, CC0) ligando os edifícios de cada dono
#   /Game/Time/M_MadeiraObra  madeira gasta do andaime (veio procedural no eixo comprido de cada peça)
#   /Game/Time/M_PedraTalhada pedra talhada para o canteiro de obras (blocos empilhados), instanciável
# Editor FECHADO: unreal/scripts/ue.sh u2_praca.py /tmp/praca.log
import unreal

mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
TEX = "/Game/Terreno/Texturas/"
PASTA = "/Game/Time"
# normal dos decais em espaço de MUNDO (normal_mundo): em espaço tangente a praça saía escura e azulada até ao sol (medido em
# 14/10). False = sem relevo nenhum (só o difuso).
COM_NORMAL = True
# o mar fica em z = -70 (u1_mar.py): praça e estrada da beira somem entre -30 e +10 (não pintam o fundo visto pela água)
AGUA_Z = "-30.0"


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


def normal_mundo(mat, nor):
    # a normal em espaço tangente do decal saía escura e azulada (medido em 14/10); como a textura é amostrada em X/Y do
    # mundo, o mapa (GL: verde = +V = +Y) vira normal de mundo direto, sem passar pela base do decal
    mat.set_editor_property("tangent_space_normal", False)
    nw = custom(mat, "return normalize(float3(N.x, N.y, max(N.z, 0.3)));", ["N"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -500, 150)
    mel.connect_material_expressions(nor, "RGB", nw, "N")
    mel.connect_material_property(nw, "", unreal.MaterialProperty.MP_NORMAL)


def novo(nome):
    caminho = PASTA + "/" + nome
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        unreal.EditorAssetLibrary.delete_asset(caminho)
    return tools.create_asset(nome, PASTA, unreal.Material, unreal.MaterialFactoryNew())


def praca():
    mat = novo("M_PracaDecal")
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)   # antes do domínio: decal opaco não compila
    mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_DEFERRED_DECAL)
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
return saturate((d - limite * 0.5) / max(limite, 0.01)) * saturate((P.z - AGUA_Z) / 40.0);   // some abaixo da linha d'água
""".replace("AGUA_Z", AGUA_Z), ["UV", "N", "P"], unreal.CustomMaterialOutputType.CMOT_FLOAT1, -500, 600)
    mel.connect_material_expressions(uv0, "", borda, "UV")
    mel.connect_material_expressions(ruido, "R", borda, "N")
    mel.connect_material_expressions(wp, "", borda, "P")
    # tom: lajota um pouco mais quente e clara (pedra de calcário ao sol), com sujeira nas juntas pela variação do ruído
    tom = custom(mat, "return C * float3(1.24, 1.13, 0.94) * (0.88 + 0.24 * N);   // calcário claro e quente (sem estourar no branco ao sol)", ["C", "N"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -500, -200)
    mel.connect_material_expressions(cor, "RGB", tom, "C")
    mel.connect_material_expressions(ruido, "R", tom, "N")
    mel.connect_material_property(tom, "", unreal.MaterialProperty.MP_BASE_COLOR)
    if COM_NORMAL:
        normal_mundo(mat, nor)
    mel.connect_material_property(rug, "R", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(borda, "", unreal.MaterialProperty.MP_OPACITY)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


def estrada():
    # caminho de terra batida entre os edificios: faixa de decal girada no sentido do caminho (U ao longo, V atravessado),
    # textura em coordenadas de mundo (sem esticar em caminho comprido), dois sulcos de roda e borda irregular pelo ruido
    mat = novo("M_EstradaDecal")
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)   # antes do domínio: decal opaco não compila
    mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_DEFERRED_DECAL)
    st = unreal.MaterialSamplerType
    wp = no(mat, unreal.MaterialExpressionWorldPosition, -1400, 0)
    uvw = custom(mat, "return P.xy / 320.0;", ["P"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -1200, 0)
    mel.connect_material_expressions(wp, "", uvw, "P")
    cor = amostra(mat, "brown_mud_dry_Diffuse", st.SAMPLERTYPE_COLOR, uvw, -900, -200)
    nor = amostra(mat, "brown_mud_dry_nor_gl", st.SAMPLERTYPE_NORMAL, uvw, -900, 100)
    rug = amostra(mat, "brown_mud_dry_Rough", st.SAMPLERTYPE_MASKS, uvw, -900, 400)
    uv0 = no(mat, unreal.MaterialExpressionTextureCoordinate, -1400, 600)
    uvr = custom(mat, "return P.xy / 700.0;", ["P"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -1200, 750)
    mel.connect_material_expressions(wp, "", uvr, "P")
    ruido = amostra(mat, "/Game/Time/T_Ruido", st.SAMPLERTYPE_MASKS, uvr, -900, 700)
    borda = custom(mat, """
float a = abs(UV.y - 0.5) * 2.0;                        // 0 no meio do caminho, 1 na beira da faixa
float lado = saturate((1.0 - a) / (0.30 + 0.35 * N));    // beira irregular, some na grama
float pontas = saturate(min(UV.x, 1.0 - UV.x) * 10.0);   // as pontas ficam sob as pracas
return lado * pontas * 0.92 * saturate((P.z - AGUA_Z) / 40.0);   // some abaixo da linha d'água
""".replace("AGUA_Z", AGUA_Z), ["UV", "N", "P"], unreal.CustomMaterialOutputType.CMOT_FLOAT1, -500, 600)
    mel.connect_material_expressions(uv0, "", borda, "UV")
    mel.connect_material_expressions(ruido, "R", borda, "N")
    mel.connect_material_expressions(wp, "", borda, "P")
    tom = custom(mat, """
float a = abs(UV.y - 0.5) * 2.0;
float sulco = 1.0 - 0.22 * exp(-pow((a - 0.42) / 0.09, 2.0));   // duas trilhas de roda mais escuras
return C * float3(1.10, 1.02, 0.90) * sulco * (0.90 + 0.20 * N);   // terra batida clara e quente
""", ["C", "UV", "N"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -500, -200)
    mel.connect_material_expressions(cor, "RGB", tom, "C")
    mel.connect_material_expressions(uv0, "", tom, "UV")
    mel.connect_material_expressions(ruido, "R", tom, "N")
    mel.connect_material_property(tom, "", unreal.MaterialProperty.MP_BASE_COLOR)
    if COM_NORMAL:
        normal_mundo(mat, nor)
    mel.connect_material_property(rug, "R", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(borda, "", unreal.MaterialProperty.MP_OPACITY)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)


def madeira():
    # madeira do andaime (postes e tábuas são instâncias do cubo/cilindro do motor, esticadas): veio ao longo do eixo mais
    # comprido de cada peça, tom gasto de madeira ao tempo e variação por instância
    mat = novo("M_MadeiraObra")
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    st = unreal.MaterialSamplerType
    wp = no(mat, unreal.MaterialExpressionWorldPosition, -1600, 0)
    eixos = []
    for i, v in enumerate(((1, 0, 0), (0, 1, 0), (0, 0, 1))):
        k = no(mat, unreal.MaterialExpressionConstant3Vector, -1800, 200 + i * 120)
        k.set_editor_property("constant", unreal.LinearColor(v[0], v[1], v[2], 1.0))
        t = no(mat, unreal.MaterialExpressionTransform, -1600, 200 + i * 120)
        t.set_editor_property("transform_source_type", unreal.MaterialVectorCoordTransformSource.TRANSFORMSOURCE_LOCAL)
        t.set_editor_property("transform_type", unreal.MaterialVectorCoordTransform.TRANSFORM_WORLD)
        mel.connect_material_expressions(k, "", t, "")
        eixos.append(t)
    uv = custom(mat, """
float lx = length(AX), ly = length(AY), lz = length(AZ);
float3 g = (lx >= ly && lx >= lz) ? AX / lx : ((ly >= lz) ? AY / ly : AZ / lz);   // veio no eixo mais comprido da peça
float ao = dot(P, g);
float3 r = P - g * ao;
return float2(ao / 420.0, (r.x + r.y * 1.37 + r.z * 0.71) / 7.0);
""", ["P", "AX", "AY", "AZ"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -1300, 100)
    mel.connect_material_expressions(wp, "", uv, "P")
    for nome, t in zip(("AX", "AY", "AZ"), eixos):
        mel.connect_material_expressions(t, "", uv, nome)
    veio = amostra(mat, "/Game/Time/T_Ruido", st.SAMPLERTYPE_MASKS, uv, -1000, 100)
    rnd = no(mat, unreal.MaterialExpressionPerInstanceRandom, -1000, 350)
    cor = custom(mat, """
float v = saturate(N * 1.3 - 0.15);
float3 c = lerp(float3(0.20, 0.12, 0.06), float3(0.55, 0.39, 0.22), v);   // anel escuro / lenho claro
c = lerp(c, float3(0.36, 0.33, 0.28), 0.10);                              // um pouco gasta ao tempo (cinza demais parecia metal)
return c * (0.82 + 0.36 * R);
""", ["N", "R"], unreal.CustomMaterialOutputType.CMOT_FLOAT3, -650, 100)
    mel.connect_material_expressions(veio, "R", cor, "N")
    mel.connect_material_expressions(rnd, "", cor, "R")
    mel.connect_material_property(cor, "", unreal.MaterialProperty.MP_BASE_COLOR)
    r = no(mat, unreal.MaterialExpressionConstant, -650, 300)
    r.set_editor_property("r", 0.82)
    mel.connect_material_property(r, "", unreal.MaterialProperty.MP_ROUGHNESS)
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
    mix = custom(mat, "float3 w = abs(N); w /= (w.x + w.y + w.z); return (A * w.z + B * w.y + C * w.x) * float3(0.92, 0.85, 0.72);   // calcário amarelado (branco demais ao sol)",
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
estrada()
madeira()
pedra()
unreal.log("AOE_PRACA ok")
