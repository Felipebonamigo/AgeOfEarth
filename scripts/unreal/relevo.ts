// Relevo e vegetação da partida para o cliente Unreal (U3, docs/UNREAL.md): o cliente monta a malha do terreno na hora, para
// qualquer semente, tamanho, tipo de mapa e número de jogadores (sem mapa pré-construído no editor).
// Mensagens servidor → cliente, depois do `hello` (o WebSocket do Unreal recusa mensagem grande, 1009: vai em pedaços de 120 KB):
//   { type:'relevo', cab:{ n, zero, porMetro, zScale, bioma } }                       cabeçalho (n = amostras por lado: 253, 505, 1009…)
//   { type:'relevo', campo:'altura'|'grama'|'terra'|'areia'|'rocha'|'agua', d } pedaços base64 (altura = uint16; camadas = uint8)
//   { type:'relevo', fim:true }
//   { type:'plantas', grupo, malhas?, p:[x,y,z,yaw,k,e,pitch …] }              vegetação rasteira e rochas, 3000 pontos por mensagem
//   { type:'plantas', fim:true }
import type { GameState } from '../../src/core/types';
import { buildTerrain } from './export-terrain';
import { sortearPlantas } from '../../unreal/scripts/u3-plantas';

const b64 = (u: Uint8Array | Uint16Array) => Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString('base64');
const PARTE = 120_000;

/** Bioma do Unreal (Dados/biomas.json): mapas de mar/ilhas/costa e o Egeu oficial = 'egeu'; o resto = 'atica'. */
export function biomaDe(state: GameState): string {
  const c = state.config;
  return c.mapType === 'islands' || c.mapType === 'coastal' || c.mapType === 'mediterranean' || /egeu/i.test(String((c.map as { id?: string } | undefined)?.id ?? '')) ? 'egeu' : 'atica';
}

/** `n` amostras por lado do relevo (505 = 504 quads = 7 blocos de 72); `plantas: false` não manda a vegetação. */
export function relevoMensagens(state: GameState, opts: { n?: number; plantas?: boolean } = {}): object[] {
  const n = opts.n ?? 505;
  if (n <= 0) return [];
  const t = buildTerrain(state.map, { size: n, name: 'partida' });
  const out: object[] = [{ type: 'relevo', cab: { n: t.size, zero: 32768, porMetro: 128, zScale: 100, bioma: biomaDe(state) } }];
  const campos = { altura: t.height, grama: t.grass, terra: t.dirt, areia: t.sand, rocha: t.rock, agua: t.water } as const;
  for (const [campo, arr] of Object.entries(campos)) {
    const d = b64(arr);
    for (let i = 0; i < d.length; i += PARTE) out.push({ type: 'relevo', campo, d: d.slice(i, i + PARTE) });
  }
  out.push({ type: 'relevo', fim: true });
  if (opts.plantas !== false) {
    for (const [grupo, gp] of Object.entries(sortearPlantas(t))) {
      for (let i = 0; i < gp.pontos.length; i += 3000 * 7) out.push({ type: 'plantas', grupo, malhas: i === 0 ? gp.malhas : undefined, p: gp.pontos.slice(i, i + 3000 * 7) });
    }
    out.push({ type: 'plantas', fim: true });
  }
  return out;
}
