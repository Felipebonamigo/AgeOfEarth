// Mapas fixos embutidos no jogo (arquivos .map.json gerados por scripts/export-map.ts ou desenhados no editor).
// O que viaja pela rede é sempre o dado inline (GameConfig.map); estes são só a fonte para os seletores.
import type { FixedMapData } from '../../map/fixed';
import estreito from './estreito.map.json';

export const BUILTIN_MAPS: Record<string, FixedMapData> = {
  estreito: estreito as unknown as FixedMapData,
};
export const BUILTIN_MAP_IDS = Object.keys(BUILTIN_MAPS);
