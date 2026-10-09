# Depuração: lista os atores do mapa AOE_MAP e as propriedades das luzes/céu (rode com UnrealEditor-Cmd -ExecutePythonScript).
import os
import unreal

lvl = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
lvl.load_level(os.environ.get("AOE_MAP", "/Game/Maps/U0"))
for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
    unreal.log("AOEI %s %s loc=%s rot=%s" % (a.get_class().get_name(), a.get_actor_label(), a.get_actor_location(), a.get_actor_rotation()))
    for cls in (unreal.DirectionalLightComponent, unreal.SkyLightComponent, unreal.SkyAtmosphereComponent):
        c = a.get_component_by_class(cls)
        if c:
            props = ("intensity", "atmosphere_sun_light", "mobility", "real_time_capture", "light_color", "affects_world", "visible",
                     "transmittance_min_light_elevation_angle", "bottom_radius", "light_source_angle")
            vals = []
            for p in props:
                try:
                    vals.append("%s=%s" % (p, c.get_editor_property(p)))
                except Exception:
                    pass
            unreal.log("AOEI   %s: %s" % (cls.__name__, "; ".join(vals)))
