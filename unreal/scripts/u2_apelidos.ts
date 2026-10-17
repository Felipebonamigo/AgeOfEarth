// Gera unreal/AgeOfEarthUE/Dados/apelidos.json: tipo sem visual próprio no Unreal -> tipo cujo visual ele usa por enquanto.
// Base: os mesmos apelidos do cliente web (src/render/art/alias.ts, lidos sem mexer nele), mais os do Unreal para o que
// nem o web cobre (navios, Titãs, criaturas novas). Sem isto, os 20 edifícios e 58 unidades da expansão das Eras viravam caixas
// coloridas (15/10/2026). O cliente segue a cadeia até achar um tipo com visual no AoEVisuais.json.
// Uso: npx tsx unreal/scripts/u2_apelidos.ts
import fs from 'node:fs';
import { BUILDING_ART_ALIAS, UNIT_ART_ALIAS } from '../../src/render/art/alias';
import { BUILDINGS } from '../../src/core/data/buildings';
import { UNITS } from '../../src/core/data/units';

const UNREAL_UNIDADES: Record<string, string> = {
  // navios (17/10/2026): trireme, barco de pesca e couracado tem malha propria; os demais usam a mais proxima (o balanço no mar vem do movimento "barco")
  transport_ship: 'trireme', merchant_ship: 'fishing_boat', penteconter: 'trireme',
  quinquereme: 'trireme', dromon: 'trireme', ship_of_the_line: 'galleon', ironclad: 'battleship',
  medusa: 'hydra', sentinel: 'colossus', shade: 'myrmidon', oceanus: 'cronus',
};
const UNREAL_CONSTRUCOES: Record<string, string> = { titan_gate: 'wonder_zeus', cornucopia: 'temple' };

const cat = JSON.parse(fs.readFileSync('unreal/AgeOfEarthUE/Dados/AoEVisuais.json', 'utf8'));
const resolver = (tipo: string, proprios: Record<string, unknown>, ap: Record<string, string>) => {
  let t = tipo;
  for (let i = 0; i < 6 && !proprios[t] && ap[t]; i++) t = ap[t];
  return proprios[t] ? t : null;
};
const unidades = { ...UNIT_ART_ALIAS, ...UNREAL_UNIDADES };
const construcoes = { ...BUILDING_ART_ALIAS, ...UNREAL_CONSTRUCOES };
const faltam: string[] = [];
for (const k of Object.keys(UNITS)) if (!resolver(k, cat.unidades, unidades)) faltam.push('unidade ' + k);
for (const k of Object.keys(BUILDINGS)) if (!resolver(k, cat.construcoes, construcoes)) faltam.push('edifício ' + k);
fs.writeFileSync('unreal/AgeOfEarthUE/Dados/apelidos.json', JSON.stringify({
  _comentario: 'Gerado por unreal/scripts/u2_apelidos.ts (base: src/render/art/alias.ts). Tipo sem visual próprio -> tipo cujo visual usa.',
  unidades, construcoes,
}, null, 2) + '\n');
console.log(`apelidos: ${Object.keys(unidades).length} unidades, ${Object.keys(construcoes).length} edifícios; sem visual depois deles: ${faltam.length ? faltam.join(', ') : 'nenhum'}`);
if (faltam.length) process.exit(1);
