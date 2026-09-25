// Mapas fixos embutidos no jogo: os oficiais são desenhados por scripts/maps/<id>.ts (ops do editor, simetria conferida);
// O que viaja pela rede é sempre o dado inline (GameConfig.map); estes são só a fonte para os seletores.
import type { FixedMapData } from '../../map/fixed';
import estreito from './estreito.map.json';
import egeu from './egeu.map.json';

export const BUILTIN_MAPS: Record<string, FixedMapData> = {
  estreito: estreito as unknown as FixedMapData,
  egeu: egeu as unknown as FixedMapData,
};
export const BUILTIN_MAP_IDS = Object.keys(BUILTIN_MAPS);
