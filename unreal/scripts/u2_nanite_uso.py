# U2: liga "Used with Nanite" em todos os materiais-base das pastas do jogo. Sem a flag o log da build avisava
# "missing usage flag Nanite! Default Material will be used in game" para edifícios e árvores com Nanite (os MIs herdam do pai).
# Materiais com vento (WPO) ficam SEM a flag: Nanite + WPO + sombras virtuais travou a GPU (DXGI_ERROR_DEVICE_HUNG em
# RenderVirtualShadowMaps(Nanite), de novo em 14/10 quando a flag foi ligada em todos); sem a flag, malha Nanite com eles cai
# no material padrão, então essas malhas ficam com Nanite desligado (u1_nanite.py).
# Idempotente. Editor FECHADO: unreal/scripts/ue.sh u2_nanite_uso.py /tmp/nanite.log
import unreal

SEM_NANITE = {"M_Vegetal", "M_Meshy_Vento", "M_Estandarte"}

reg = unreal.AssetRegistryHelpers.get_asset_registry()
ligados = 0
for pasta in ("/Game/Meshy", "/Game/Vegetacao", "/Game/Time", "/Game/Unidades2", "/Game/Terreno"):
    for a in reg.get_assets_by_path(pasta, recursive=True):
        if str(a.asset_class_path.asset_name) != "Material":
            continue
        mat = a.get_asset()
        quer = str(a.asset_name) not in SEM_NANITE
        if mat.get_editor_property("used_with_nanite") == quer:
            continue
        mat.set_editor_property("used_with_nanite", quer)
        unreal.EditorAssetLibrary.save_loaded_asset(mat)
        ligados += 1
        unreal.log("AOE_NANITE %s -> %s" % (a.package_name, quer))
unreal.log("AOE_NANITE ok: %d materiais ligados" % ligados)
