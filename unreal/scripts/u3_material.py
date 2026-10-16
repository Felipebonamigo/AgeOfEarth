# U3: /Game/Terreno/M_TerrenoRT — material do terreno montado em tempo de execução (malha comum, não Landscape).
# Mesmas fotos, mesma quebra de repetição, mesmo tom mediterrâneo e macro-variação do M_U1_Terreno (build_u1_map.py), mas a mistura
# das 4 camadas vem de uma textura de pesos (RGBA = terra, areia, rocha, grama; criada pelo C++ a partir do hello) amostrada em
# coordenadas de mundo / LadoMapa, no lugar do LandscapeLayerWeight.
# Editor FECHADO: unreal/scripts/ue.sh u3_material.py /tmp/u3mat.log
import os
import sys

import unreal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_u1_map as b  # noqa: E402  (reaproveita no/constante/mult/camada/ondas)

mel = b.mel
no, constante, mult, camada, ondas = b.no, b.constante, b.mult, b.camada, b.ondas


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


def main():
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    caminho = "/Game/Terreno/M_TerrenoRT"
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        unreal.EditorAssetLibrary.delete_asset(caminho)
    mat = tools.create_asset("M_TerrenoRT", "/Game/Terreno", unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("two_sided", True)   # enquanto a ordem dos triângulos da malha não é conferida em jogo
    wpn = no(mat, unreal.MaterialExpressionWorldPosition, -1700, -400)
    ru = ondas(mat, wpn, 0.0011, 0.0017, -1500, -400)

    cores, ruges, normais = {}, {}, {}
    y = 0
    for nome in b.LAYERS:
        ph, metros = b.FOTOS[nome]
        c, r, n = camada(mat, ph, metros, 0, y, ru)
        cores[nome], ruges[nome], normais[nome] = c, r, n
        y += 700

    # grama: dessatura 35 % e puxa para o verde (igual ao M_U1_Terreno)
    tom = no(mat, unreal.MaterialExpressionConstant3Vector, 300, -80)
    tom.set_editor_property("constant", unreal.LinearColor(0.80, 0.88, 0.58, 1.0))
    dess = no(mat, unreal.MaterialExpressionDesaturation, 300, -200)
    mel.connect_material_expressions(cores["grass"], "", dess, "")
    mel.connect_material_expressions(constante(mat, 0.35, 150, -200), "", dess, "Fraction")
    cores["grass"] = mult(mat, dess, tom, 450, -40)

    # pesos: textura (RGBA = terra, areia, rocha, grama) em coordenadas de mundo / LadoMapa
    lado = no(mat, unreal.MaterialExpressionScalarParameter, -1300, 1200)
    lado.set_editor_property("parameter_name", "LadoMapa")
    lado.set_editor_property("default_value", 22400.0)
    uvp = custom(mat, "return P.xy / L;", ["P", "L"], unreal.CustomMaterialOutputType.CMOT_FLOAT2, -1100, 1200)
    mel.connect_material_expressions(wpn, "", uvp, "P")
    mel.connect_material_expressions(lado, "", uvp, "L")
    pesos = no(mat, unreal.MaterialExpressionTextureSampleParameter2D, -900, 1200)
    pesos.set_editor_property("parameter_name", "Pesos")
    pesos.set_editor_property("texture", unreal.load_asset("/Game/Meshy/T_BrancoLinear"))
    pesos.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
    mel.connect_material_expressions(uvp, "", pesos, "UVs")

    def misturar(dic, tipo, x, y0, saida):
        # soma ponderada: pesos.A = grama, .R = terra, .G = areia, .B = rocha
        cod = "return G * W.a + D * W.r + S * W.g + R * W.b;"
        c = custom(mat, cod.replace("W.a", "W.w").replace("W.r", "W.x").replace("W.g", "W.y").replace("W.b", "W.z"), ["G", "D", "S", "R", "W"], saida, x, y0)
        for nome, k in (("G", "grass"), ("D", "dirt"), ("S", "sand"), ("R", "rock")):
            mel.connect_material_expressions(dic[k], "", c, nome)
        mel.connect_material_expressions(pesos, "RGBA", c, "W")
        return c

    FL3, FL1 = unreal.CustomMaterialOutputType.CMOT_FLOAT3, unreal.CustomMaterialOutputType.CMOT_FLOAT3
    cor = misturar(cores, "cor", 700, 0, FL3)
    rug3 = misturar(ruges, "rug", 700, 900, FL3)
    nor = misturar(normais, "nor", 700, 1800, FL3)
    rug = no(mat, unreal.MaterialExpressionComponentMask, 950, 900)
    for k in "rgba":
        rug.set_editor_property(k, k == "r")
    mel.connect_material_expressions(rug3, "", rug, "")
    nnor = custom(mat, "return normalize(N);", ["N"], FL3, 950, 1800)
    mel.connect_material_expressions(nor, "", nnor, "N")

    macro = ondas(mat, wpn, 0.00031, 0.00043, -1500, -900, 0.74, 1.14)
    cor2 = mult(mat, cor, macro, 1100, 0)
    mel.connect_material_property(cor2, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(rug, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(nnor, "", unreal.MaterialProperty.MP_NORMAL)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    unreal.log("AOE_U3MAT ok")


main()
