# U1: desliga o Nanite nas malhas que têm vento (WPO) e folhagem recortada: árvores/arbustos do Meshy e as plantas do Poly Haven.
# Na build empacotada o Nanite + mapa de sombras virtual + WPO travou a GPU (DXGI_ERROR_DEVICE_HUNG em Nanite::DrawGeometry,
# reproduzível na tomada 30,57). Prédios e unidades seguem com Nanite. Idempotente.
import unreal

reg = unreal.AssetRegistryHelpers.get_asset_registry()
n = 0
for pasta in ("/Game/Meshy/natureza", "/Game/Vegetacao"):
    for a in reg.get_assets_by_path(pasta, recursive=True):
        if str(a.asset_class_path.asset_name) != "StaticMesh":
            continue
        m = unreal.load_asset(str(a.package_name))
        ns = m.get_editor_property("nanite_settings")
        if ns.get_editor_property("enabled"):
            ns.set_editor_property("enabled", False)
            m.set_editor_property("nanite_settings", ns)
            unreal.EditorAssetLibrary.save_loaded_asset(m)
            n += 1
unreal.log("AOE_NANITE desligado em %d malhas" % n)
