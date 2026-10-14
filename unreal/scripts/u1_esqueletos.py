# U1: cria os SkeletalMesh dos humanoides do Meshy (/Game/Unidades/SK_*) pendurados no esqueleto do Manny, com pesos de pele
# por proximidade (UAoESkinTools::BuildSkinnedFromStatic). As animações do Manny (/Game/Mannequins/Anims) tocam neles.
# Uso (editor FECHADO, módulo já compilado):  unreal/scripts/ue.sh u1_esqueletos.py /tmp/esq.log
# Variáveis: AOE_SO=trecho,trecho (só os que casarem), AOE_SUAVIDADE (padrão 4).
import os
import traceback

import unreal

SO = [s for s in os.environ.get("AOE_SO", "").lower().split(",") if s]
SUAVIDADE = float(os.environ.get("AOE_SUAVIDADE", "4"))
MOLDE = "/Game/Mannequins/Meshes/SKM_Manny_Simple"
# nome do asset -> (malha estática importada, giro em Z para a frente ficar no +Y do Manny)
HUMANOIDES = {
    "SK_HoplitaAteniense": ("unidades/hoplite__athenian-hoplite", 0.0),
    "SK_HoplitaPenacho": ("unidades/hoplite__red-crested-hoplite", 0.0),
    "SK_Mirmidao": ("unidades/myrmidon__spartan-ultrarealistic", 0.0),
    "SK_Hipaspista": ("unidades/hypaspist__spartan-red-cape", 0.0),
    "SK_Milicia": ("unidades/militia__spear-infantry", 0.0),
    "SK_CidadaA": ("unidades/villager__peasant-maiden", 0.0),
    "SK_CidadaB": ("unidades/villager__peasant-girl", 0.0),
    "SK_Heracles": ("unidades/heracles__lion-warrior", 0.0),
}
# se a frente do modelo (glTF +Z) cair em outro lado, ajuste aqui por nome: {"SK_Milicia": 90.0}
GIRO = {}


def main():
    molde = unreal.load_asset(MOLDE)
    if not molde:
        unreal.log_error("AOE_ESQ molde nao encontrado: " + MOLDE)
        return
    unreal.EditorAssetLibrary.make_directory("/Game/Unidades")
    for nome, (malha, giro) in HUMANOIDES.items():
        if SO and not any(s in nome.lower() for s in SO):
            continue
        pasta, base = malha.split("/")
        caminho_malha = "/Game/Meshy/%s/%s/StaticMeshes/%s" % (pasta, base, base.replace("-", "_"))
        src = unreal.load_asset(caminho_malha)
        if not src:
            unreal.log_error("AOE_ESQ malha nao encontrada: " + caminho_malha)
            continue
        destino = "/Game/Unidades/" + nome
        try:
            if unreal.EditorAssetLibrary.does_asset_exist(destino):
                unreal.EditorAssetLibrary.delete_asset(destino)
            out = unreal.AoESkinTools.build_skinned_from_static(src, molde, destino, GIRO.get(nome, giro), SUAVIDADE)
            if out:
                unreal.EditorAssetLibrary.save_loaded_asset(out)
                unreal.log("AOE_ESQ ok %s" % nome)
            else:
                unreal.log_error("AOE_ESQ falhou (nulo): " + nome)
        except Exception:
            unreal.log_error("AOE_ESQ FALHOU %s\n%s" % (nome, traceback.format_exc()))
    unreal.log("AOE_ESQ_FIM")


main()
