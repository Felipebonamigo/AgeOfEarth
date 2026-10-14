# U1: troca o pai dos materiais importados do Meshy (glTF "MI_Default_Opaque_DS", que deixava as árvores pretas por causa da
# metalicidade do canal B da textura metallic_roughness) por dois materiais-mestre próprios:
#   M_Meshy        edifícios, unidades e criaturas: cor + normal + rugosidade da textura; metálico só se o MI pedir (MetalMul)
#   M_Meshy_Vento  natureza: o mesmo + dupla face (folhagem) + vento (balanço por altura, fase por instância)
# Roda sobre /Game/Meshy já importado (u1_importar.py). Idempotente.
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


def constante(mat, v, x, y):
    n = no(mat, unreal.MaterialExpressionConstant, x, y)
    n.set_editor_property("r", v)
    return n


def param_escalar(mat, nome, v, x, y):
    n = no(mat, unreal.MaterialExpressionScalarParameter, x, y)
    n.set_editor_property("parameter_name", nome)
    n.set_editor_property("default_value", v)
    return n


def mult(mat, a, b, x, y, ao="", bo=""):
    n = no(mat, unreal.MaterialExpressionMultiply, x, y)
    mel.connect_material_expressions(a, ao, n, "A")
    mel.connect_material_expressions(b, bo, n, "B")
    return n


def textura_branca():
    """4x4 branca e LINEAR (sem sRGB): padrão dos parâmetros de metal/rugosidade, para o sampler Linear Color compilar."""
    import os
    import struct
    import tempfile
    import zlib

    caminho = "/Game/Meshy/T_BrancoLinear"
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        return caminho
    raw = b"".join(b"\x00" + b"\xff\xff\xff" * 4 for _ in range(4))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 4, 4, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    f = os.path.join(tempfile.gettempdir(), "aoe_branco.png")
    with open(f, "wb") as fh:
        fh.write(png)
    tk = unreal.AssetImportTask()
    tk.set_editor_property("filename", f)
    tk.set_editor_property("destination_path", "/Game/Meshy")
    tk.set_editor_property("destination_name", "T_BrancoLinear")
    tk.set_editor_property("automated", True)
    tk.set_editor_property("replace_existing", True)
    tk.set_editor_property("save", True)
    tools.import_asset_tasks([tk])
    tex = unreal.load_asset(caminho)
    tex.set_editor_property("srgb", False)
    unreal.EditorAssetLibrary.save_loaded_asset(tex)
    return caminho


def mestre(nome, vento):
    caminho = "/Game/Meshy/" + nome
    if unreal.EditorAssetLibrary.does_asset_exist(caminho):
        unreal.EditorAssetLibrary.delete_asset(caminho)
    mat = tools.create_asset(nome, "/Game/Meshy", unreal.Material, unreal.MaterialFactoryNew())
    # as árvores são instâncias (HISM); sem este flag o material cai no padrão (cinza) no jogo
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    mat.set_editor_property("used_with_skeletal_mesh", True)   # as unidades animadas (SkeletalMesh) usam os mesmos mestres
    st = unreal.MaterialSamplerType
    cor = param_tex(mat, "BaseColorTexture", "/Engine/EngineResources/WhiteSquareTexture", st.SAMPLERTYPE_COLOR, -900, 0)
    nor = param_tex(mat, "NormalTexture", "/Engine/EngineMaterials/DefaultNormal", st.SAMPLERTYPE_NORMAL, -900, 300)
    mr = param_tex(mat, "MetallicRoughnessTexture", textura_branca(), st.SAMPLERTYPE_LINEAR_COLOR, -900, 600)
    mel.connect_material_property(cor, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(nor, "RGB", unreal.MaterialProperty.MP_NORMAL)
    # rugosidade: canal G da textura, nunca abaixo de 0.35 (sem espelho) nem acima de 1
    rug = no(mat, unreal.MaterialExpressionClamp, -500, 600)
    rug.set_editor_property("min_default", 0.35)
    rug.set_editor_property("max_default", 1.0)
    mel.connect_material_expressions(mr, "G", rug, "")
    mel.connect_material_property(rug, "", unreal.MaterialProperty.MP_ROUGHNESS)
    metal = mult(mat, mr, param_escalar(mat, "MetalMul", 0.0, -700, 800), -500, 800, "B", "")
    mel.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
    if vento:
        mat.set_editor_property("two_sided", True)
        mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)   # copas translúcidas à contraluz
        mel.connect_material_property(mult(mat, cor, constante(mat, 0.5, -700, -150), -500, -150, "RGB", ""), "", unreal.MaterialProperty.MP_SUBSURFACE_COLOR)
        # vento: deslocamento horizontal que cresce com a altura acima da base do objeto, fase pela posição do objeto
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
        k = mult(mat, zc, constante(mat, 1.0 / 600.0, -700, 1500), -400, 1400)
        k2 = mult(mat, k, k, -250, 1400)
        ox = no(mat, unreal.MaterialExpressionComponentMask, -700, 1250)
        for c in "rgba":
            ox.set_editor_property(c, c == "r")
        mel.connect_material_expressions(obj, "", ox, "")
        fase = mult(mat, ox, constante(mat, 0.013, -550, 1250), -400, 1250)
        vel = mult(mat, t, constante(mat, 1.7, -700, 1100), -550, 1100)
        soma = no(mat, unreal.MaterialExpressionAdd, -250, 1150)
        mel.connect_material_expressions(vel, "", soma, "A")
        mel.connect_material_expressions(fase, "", soma, "B")
        sn = no(mat, unreal.MaterialExpressionSine, -100, 1150)
        mel.connect_material_expressions(soma, "", sn, "")
        amp = param_escalar(mat, "VentoAmplitude", 28.0, -100, 1300)
        desloc = mult(mat, mult(mat, sn, k2, 50, 1150), amp, 200, 1150)
        dir_ = no(mat, unreal.MaterialExpressionConstant3Vector, 200, 1300)
        dir_.set_editor_property("constant", unreal.LinearColor(0.8, 0.45, 0.0, 0.0))
        wpo = mult(mat, desloc, dir_, 400, 1200)
        mel.connect_material_property(wpo, "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def main():
    base = mestre("M_Meshy", False)
    vento = mestre("M_Meshy_Vento", True)
    trocados = 0
    for a in reg.get_assets_by_path("/Game/Meshy", recursive=True):
        if str(a.asset_class_path.asset_name) != "MaterialInstanceConstant":
            continue
        try:
            mi = a.get_asset()
            mestre_do_mi = vento if "/natureza/" in str(a.package_name) else base
            mi.set_editor_property("parent", mestre_do_mi)
            # texturas: normal = mapa de normais; metallic_roughness = linear (sem sRGB)
            for tp in mi.get_editor_property("texture_parameter_values"):
                nome = str(tp.parameter_info.name)
                tex = tp.parameter_value
                if not tex:
                    continue
                if nome == "NormalTexture":
                    tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                    tex.set_editor_property("srgb", False)
                    unreal.EditorAssetLibrary.save_loaded_asset(tex)
                elif nome == "MetallicRoughnessTexture":
                    tex.set_editor_property("srgb", False)
                    unreal.EditorAssetLibrary.save_loaded_asset(tex)
            # ouro e metais: o MI pede metal pela própria pasta
            if "gold__" in str(a.package_name) or "statue" in str(a.package_name) or "talos" in str(a.package_name):
                mi.set_editor_property("scalar_parameter_values", [])
                mel.set_material_instance_scalar_parameter_value(mi, "MetalMul", 0.6)
            unreal.EditorAssetLibrary.save_loaded_asset(mi)
            trocados += 1
        except Exception:
            unreal.log_error("AOE_MAT FALHOU %s\n%s" % (a.package_name, traceback.format_exc()))
    unreal.log("AOE_MAT %d materiais trocados" % trocados)


main()
