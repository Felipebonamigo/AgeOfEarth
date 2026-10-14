# U2: luz de meio da manhã mediterrânea nos mapas já montados (sem refazer o terreno).
#   sol a 27° deixava sombras longas cobrindo a cidade inteira e a sombra quase preta; agora o sol sobe e a luz do céu
#   clareia a sombra (referência do dono: cidades claras do Rise of Kingdoms). Os mesmos valores estão em build_u1_map.py.
# Editor FECHADO: unreal/scripts/ue.sh u2_luz.py /tmp/luz.log
import unreal

SOL_PITCH, SOL_YAW = -50.0, 58.0
CEU_INTENSIDADE = 1.6

les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for mapa in ("/Game/Maps/U1", "/Game/Maps/U1M"):
    if not unreal.EditorAssetLibrary.does_asset_exist(mapa):
        unreal.log_warning("AOE_LUZ sem mapa %s" % mapa)
        continue
    les.load_level(mapa)
    n = 0
    for a in eas.get_all_level_actors():
        if isinstance(a, unreal.DirectionalLight):
            a.set_actor_rotation(unreal.Rotator(roll=0.0, pitch=SOL_PITCH, yaw=SOL_YAW), False)
            n += 1
        elif isinstance(a, unreal.SkyLight):
            a.get_component_by_class(unreal.SkyLightComponent).set_editor_property("intensity", CEU_INTENSIDADE)
            n += 1
    les.save_current_level()
    unreal.log("AOE_LUZ %s: %d luzes ajustadas" % (mapa, n))
