# Fica em scripts/bake/; instale o Blender como módulo numa venv: python3 -m venv bpyenv && bpyenv/bin/pip install bpy==4.5.4
# Exporte o modelo antes: node scripts/bake/export-glb.mjs art/manifest/hoplite.json --anim idle --dir 2 --out hoplite.glb
# Teste de realismo: renderiza um .glb do jogo no Blender/Cycles com a câmera e o sol do contrato do bake
# (ortográfica a 50°, sol de NO, sombras para SE), céu HDRI CC0 e chão com a textura fotográfica do jogo.
# Uso: bpyenv/bin/python render.py <modelo.glb> <saida.png> <px_por_tile> <largura_tiles> <altura_tiles> <ancora_y> [amostras] [chão 0/1] [realce 0/1]
import sys, math
import bpy
from mathutils import Vector

glb, out, ppt, wt, ht, ay = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6])
samples = int(sys.argv[7]) if len(sys.argv) > 7 else 96
with_ground = (sys.argv[8] if len(sys.argv) > 8 else '1') == '1'
enhance = (sys.argv[9] if len(sys.argv) > 9 else '1') == '1'
DL = None   # (céu HDRI não é mais usado: Nishita sem disco)
TERRAIN = '/home/user/AgeOfEarth/public/terrain/'
PITCH = math.radians(50)
M_PER_TILE = 2.0

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.film_transparent = not with_ground

bpy.ops.import_scene.gltf(filepath=glb)
objs = [o for o in sc.objects if o.type == 'MESH']

# realce dos materiais: microdetalhe (ruído na rugosidade e no relevo) e variação de cor — o que o three.js do bake não tem
def enhance_mat(m):
    if not m or not m.use_nodes: return
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: return
    name = m.name.lower()
    tc = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 60.0; noise.inputs['Detail'].default_value = 8.0
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.004
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    if not bsdf.inputs['Normal'].is_linked: nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    # rugosidade variada em torno do valor do material
    if not bsdf.inputs['Roughness'].is_linked:
        r0 = bsdf.inputs['Roughness'].default_value
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['To Min'].default_value = max(0.05, r0 - 0.15); mr.inputs['To Max'].default_value = min(1.0, r0 + 0.15)
        nt.links.new(noise.outputs['Fac'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], bsdf.inputs['Roughness'])
    # cor: sujeira suave (multiplica por 0,82–1,0) onde a cor não vem de textura
    if not bsdf.inputs['Base Color'].is_linked:
        base = bsdf.inputs['Base Color'].default_value[:]
        rgb = nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value = base
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        dirt = nt.nodes.new('ShaderNodeMapRange'); dirt.inputs['To Min'].default_value = 0.82; dirt.inputs['To Max'].default_value = 1.0
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 9.0
        nt.links.new(tc.outputs['Object'], n2.inputs['Vector']); nt.links.new(n2.outputs['Fac'], dirt.inputs['Value'])
        comb = nt.nodes.new('ShaderNodeCombineColor')
        for k in ('Red', 'Green', 'Blue'): nt.links.new(dirt.outputs['Result'], comb.inputs[k])
        mix.inputs['Factor'].default_value = 1.0
        nt.links.new(rgb.outputs[0], mix.inputs[6]); nt.links.new(comb.outputs[0], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    if 'skin' in name:
        bsdf.inputs['Subsurface Weight'].default_value = 0.25
        bsdf.inputs['Subsurface Radius'].default_value = (0.01, 0.004, 0.002)
    if any(k in name for k in ('linen', 'wool', 'cloth', 'tunic', 'team', 'crest')):
        bsdf.inputs['Sheen Weight'].default_value = 0.4
    if 'bronze' in name or 'gold' in name:
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Coat Weight'].default_value = 0.1

# máscara de time do jogo → cor do time (azul) para a prévia
for o in objs:
    for sl in o.material_slots:
        m = sl.material
        if m and m.name.lower().startswith('team_') and m.use_nodes:
            b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if b and not b.inputs['Base Color'].is_linked: b.inputs['Base Color'].default_value = (0.03, 0.08, 0.40, 1)
if enhance:
    seen = set()
    for o in objs:
        for s in o.material_slots:
            if s.material and s.material.name not in seen: seen.add(s.material.name); enhance_mat(s.material)

# chão com a textura fotográfica de grama do jogo (8 m por repetição, como o terreno)
if with_ground:
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    g = bpy.context.active_object
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True; nt = gm.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 0.95
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (60 / 8, 60 / 8, 1)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    alb = nt.nodes.new('ShaderNodeTexImage'); alb.image = bpy.data.images.load(TERRAIN + 'grass-albedo.png')
    nrm = nt.nodes.new('ShaderNodeTexImage'); nrm.image = bpy.data.images.load(TERRAIN + 'grass-normal.png'); nrm.image.colorspace_settings.name = 'Non-Color'
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    for t in (alb, nrm): nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(alb.outputs['Color'], b.inputs['Base Color']); nt.links.new(nrm.outputs['Color'], nmap.inputs['Color']); nt.links.new(nmap.outputs['Normal'], b.inputs['Normal'])
    g.data.materials.append(gm)

# céu HDRI (luz do ambiente) + sol do contrato: direção PARA o sol (-0,55; 1; -0,35) no three → Blender (x, -z, y)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
to_sun = Vector((-0.55, 0.35, 1.0)).normalized()
# céu físico (Nishita) sem o disco do sol: só a luz difusa do céu; o sol é a lâmpada abaixo, na direção do contrato
sky = w.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_disc = False
sky.sun_elevation = math.asin(to_sun.z); sky.sun_rotation = math.atan2(to_sun.x, to_sun.y)
bg = w.node_tree.nodes['Background']; bg.inputs['Strength'].default_value = 0.35
w.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color'])
sun = bpy.data.lights.new('sol', 'SUN'); sun.energy = 4.2; sun.angle = math.radians(2.5); sun.color = (1.0, 0.94, 0.85)
so = bpy.data.objects.new('sol', sun); sc.collection.objects.link(so)
so.rotation_euler = to_sun.to_track_quat('Z', 'Y').to_euler()

# câmera ortográfica do contrato: olha para +y (norte) inclinada 50°; a imagem sai esticada na vertical depois (1/sin 50°)
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
wm, hm = wt * M_PER_TILE, ht * M_PER_TILE * math.sin(PITCH)   # altura na tela em metros projetados
cam.ortho_scale = max(wm, hm)
fwd = Vector((0, math.cos(PITCH), -math.sin(PITCH)))
up = Vector((0, math.sin(PITCH), math.cos(PITCH)))
# âncora: o pé (origem) fica a `ay` da altura, centralizado na horizontal
off = (ay - 0.5) * hm
co.location = -fwd * 50 + up * off
co.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = int(round(wt * ppt))
sc.render.resolution_y = int(round(ht * ppt * math.sin(PITCH)))
if hm > wm: cam.sensor_fit = 'VERTICAL'
else: cam.sensor_fit = 'HORIZONTAL'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('ok', out, sc.render.resolution_x, sc.render.resolution_y)
