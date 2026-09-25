// Fonte procedural (docs/ART.md §3.7): o TextureCache de sempre (textures.ts), usado para toda chave que não tem quadro
// assado — tipos ainda não assados, atlas ainda carregando ou recusados, e a opção "Arte assada" desligada. Nunca falha:
// qualquer tipo de unidade/edifício/nó tem um desenho procedural.
import type { Texture } from 'pixi.js';
import type { TextureCache } from '../textures';

export class ProceduralSource {
  constructor(readonly cache: TextureCache) {}
  unit(type: string, color: number): Texture { return this.cache.unit(type, color); }
  building(type: string, color: number, complete: boolean): Texture { return this.cache.building(type, color, complete); }
  node(type: string, variant: number): Texture { return this.cache.node(type, variant); }
  shadowEllipse(rx: number, ry: number): Texture { return this.cache.shadowEllipse(rx, ry); }
  shadowRect(w: number, h: number): Texture { return this.cache.shadowRect(w, h); }
}
