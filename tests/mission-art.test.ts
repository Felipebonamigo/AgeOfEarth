// Ilustrações da campanha (ROADMAP 2.7; `npm run art:missions` → public/ui/missao-<id>.jpg): toda missão oficial tem a
// sua cena, o gerador tem uma cena para cada missão (e só para elas), e o briefing/a tela de carregamento só pedem a
// ilustração de missões da campanha (cenários de fora e a Horda ficam com o fundo do menu).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CAMPAIGN_PLAN } from '../src/core/scenario/official';
import { CAMPAIGN } from '../src/core/scenario/campaign';
import { missionArtUrl } from '../src/ui/loading';
// @ts-expect-error — módulo de dados do gerador (JS puro, sem tipos)
import { SCENES } from '../scripts/bake/illustrations/scenes.mjs';

const ROOT = path.resolve(__dirname, '..');

describe('ilustrações da campanha', () => {
  it('cada missão oficial tem a sua ilustração 16:9 em public/ui', () => {
    for (const { id } of CAMPAIGN_PLAN) {
      const f = path.join(ROOT, 'public/ui', `missao-${id}.jpg`);
      expect(fs.existsSync(f), `${f} ausente (npm run art:missions)`).toBe(true);
      const buf = fs.readFileSync(f);
      expect(buf[0] === 0xff && buf[1] === 0xd8, `${id}: não é JPEG`).toBe(true);
      // SOF0/SOF2: altura e largura do quadro
      let i = 2, w = 0, h = 0;
      while (i < buf.length) { const marker = buf[i + 1], len = buf.readUInt16BE(i + 2); if (marker === 0xc0 || marker === 0xc2) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + len; }
      expect(w, `${id}: largura`).toBeGreaterThanOrEqual(1280);
      expect(Math.abs(w / h - 16 / 9), `${id}: proporção ${w}×${h}`).toBeLessThan(0.01);
      expect(buf.length, `${id}: arquivo grande demais`).toBeLessThan(400 * 1024);
    }
  });

  it('o gerador tem exatamente uma cena por missão da campanha', () => {
    expect(Object.keys(SCENES).sort()).toEqual(CAMPAIGN.map((e) => e.id).sort());
    expect(Object.keys(SCENES).sort()).toEqual(CAMPAIGN_PLAN.map((e) => e.id).sort());
  });

  it('as unidades das cenas existem nos manifestos da arte', () => {
    for (const [id, S] of Object.entries(SCENES) as [string, { units?: { type: string }[]; rows?: { type: string | string[] }[] }][]) {
      const types = [...(S.units ?? []).map((u) => u.type), ...(S.rows ?? []).flatMap((r) => ([] as string[]).concat(r.type))];
      for (const t of types) expect(fs.existsSync(path.join(ROOT, 'art/manifest', `${t}.json`)), `${id}: ${t} sem manifesto`).toBe(true);
    }
  });

  it('só as missões oficiais pedem ilustração', () => {
    expect(missionArtUrl('m12_titanomaquia')).toMatch(/ui\/missao-m12_titanomaquia\.jpg$/);
    expect(missionArtUrl('horde')).toBeNull();
    expect(missionArtUrl('meu_cenario')).toBeNull();
    expect(missionArtUrl(undefined)).toBeNull();
  });
});
