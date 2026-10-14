# U2: cria os SkeletalMesh (/Game/Unidades2/SK2_*) das unidades e criaturas do Meshy pendurados nos esqueletos CC0 do Mesh2Motion
# (humano, cavalo, raposa, kaiju, dragão, ave, serpente), com pesos de pele por proximidade (UAoESkinTools::BuildSkinnedGeneric).
# As animações CC0 importadas por u1_anim_importar.py tocam nelas. Rode também u1_anim_ligar.py (animações extras do humano).
# Uso (editor FECHADO):  unreal/scripts/ue.sh u1_esqueletos2.py /tmp/esq2.log
# Variáveis: AOE_SO=trecho,trecho (só os que casarem), AOE_SUAVIDADE (padrão 4).
import os
import traceback

import unreal

SO = [s for s in os.environ.get("AOE_SO", "").lower().split(",") if s]
SUAVIDADE = float(os.environ.get("AOE_SUAVIDADE", "4"))
MOLDES = {
    "humano": "/Game/Anim/human_base/human-base-animations/SkeletalMeshes/human-base-animations",
    "cavalo": "/Game/Anim/horse/horse-animations/SkeletalMeshes/horse-animations",
    "raposa": "/Game/Anim/fox/fox-animations/SkeletalMeshes/fox-animations",
    "kaiju": "/Game/Anim/kaiju/kaiju-animations/SkeletalMeshes/kaiju-animations",
    "dragao": "/Game/Anim/dragon/dragon-animations/SkeletalMeshes/dragon-animations",
    "ave": "/Game/Anim/bird/bird-animations/SkeletalMeshes/bird-animations",
    "serpente": "/Game/Anim/snake/snake-animations/SkeletalMeshes/snake-animations",
}
# nome -> (malha importada, molde, modo de ajuste 0 altura / 1 comprimento, margem cm, giro em Z)
ITENS = {
    "SK2_CidadaA": ("unidades/villager__peasant-maiden", "humano", 0, 6.0, 0.0),
    "SK2_CidadaB": ("unidades/villager__peasant-girl", "humano", 0, 6.0, 0.0),
    "SK2_HoplitaAteniense": ("unidades/hoplite__athenian-hoplite", "humano", 0, 6.0, 0.0),
    "SK2_HoplitaPenacho": ("unidades/hoplite__red-crested-hoplite", "humano", 0, 6.0, 0.0),
    "SK2_Mirmidao": ("unidades/myrmidon__spartan-ultrarealistic", "humano", 0, 6.0, 0.0),
    "SK2_Hipaspista": ("unidades/hypaspist__spartan-red-cape", "humano", 0, 6.0, 0.0),
    "SK2_Milicia": ("unidades/militia__spear-infantry", "humano", 0, 6.0, 0.0),
    "SK2_Heracles": ("unidades/heracles__lion-warrior", "humano", 0, 6.0, 0.0),
    "SK2_Catafracto": ("unidades/cataphract__armored-rider", "cavalo", 1, 30.0, 0.0),
    "SK2_LeaoNemeu": ("criaturas/nemean_lion__embermane", "raposa", 1, 20.0, 0.0),
    "SK2_Cerbero": ("criaturas/cerberus__unleashed", "raposa", 1, 20.0, 0.0),
    "SK2_Quimera": ("criaturas/chimera__lion-goat-serpent", "raposa", 1, 20.0, 0.0),
    "SK2_Manticora": ("criaturas/manticore__winged", "raposa", 1, 20.0, 0.0),
    "SK2_Minotauro": ("criaturas/minotaur__tribal-attire", "kaiju", 0, 10.0, 0.0),
    "SK2_Ciclope": ("criaturas/cyclops__cyclopean-guardian", "kaiju", 0, 10.0, 0.0),
    "SK2_CiclopeSentinela": ("criaturas/cyclops__cyclopean-sentinel", "kaiju", 0, 10.0, 0.0),
    "SK2_Colosso": ("criaturas/colossus__talos-bronze", "kaiju", 0, 10.0, 0.0),
    "SK2_Cronos": ("criaturas/cronus__ancient-stone-titan", "kaiju", 0, 10.0, 0.0),
    "SK2_Dragao": ("criaturas/dragon__emerald-dragon", "dragao", 1, 20.0, 0.0),
    "SK2_Grifo": ("criaturas/griffin__lightbrown-griffin", "ave", 1, 10.0, 0.0),
    "SK2_Fenix": ("criaturas/phoenix__ember-phoenix", "ave", 1, 10.0, 0.0),
    "SK2_Harpia": ("criaturas/harpy__harpy-queen", "ave", 1, 10.0, 0.0),
    "SK2_Hidra": ("criaturas/hydra__snake-hydra", "serpente", 1, 10.0, 0.0),
}


def main():
    unreal.EditorAssetLibrary.make_directory("/Game/Unidades2")
    moldes = {k: unreal.load_asset(v) for k, v in MOLDES.items()}
    for nome, (malha, molde, modo, margem, giro) in ITENS.items():
        if SO and not any(s in nome.lower() for s in SO):
            continue
        if not moldes.get(molde):
            unreal.log_error("AOE_ESQ2 molde ausente: " + molde)
            continue
        pasta, base = malha.split("/")
        caminho_malha = "/Game/Meshy/%s/%s/StaticMeshes/%s" % (pasta, base, base.replace("-", "_"))
        src = unreal.load_asset(caminho_malha)
        if not src:
            unreal.log_error("AOE_ESQ2 malha nao encontrada: " + caminho_malha)
            continue
        destino = "/Game/Unidades2/" + nome
        try:
            if unreal.EditorAssetLibrary.does_asset_exist(destino):
                unreal.EditorAssetLibrary.delete_asset(destino)
            out = unreal.AoESkinTools.build_skinned_generic(src, moldes[molde], destino, giro, SUAVIDADE, modo, margem)
            if out:
                unreal.EditorAssetLibrary.save_loaded_asset(out)
                unreal.log("AOE_ESQ2 ok %s" % nome)
            else:
                unreal.log_error("AOE_ESQ2 falhou (nulo): " + nome)
        except Exception:
            unreal.log_error("AOE_ESQ2 FALHOU %s\n%s" % (nome, traceback.format_exc()))
    unreal.log("AOE_ESQ2_FIM")


main()
