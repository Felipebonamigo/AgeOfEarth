// Plano oficial da campanha "Titanomaquia" (docs/STORY.md §4): ids e atos das 12 missões, existam ou não os arquivos.
// Serve aos ids reservados (validateScenario), às conquistas de ato e ao registro (campaign.ts), sem importar nada do motor.

export type CampaignAct = 1 | 2 | 3;

/** As 12 missões oficiais, na ordem de jogo. m1–m3 são o prólogo (TS); m4…m12 serão arquivos JSON em missions/. */
export const CAMPAIGN_PLAN: readonly { id: string; act: CampaignAct }[] = [
  { id: 'm1_despertar', act: 1 }, { id: 'm2_cerco', act: 1 }, { id: 'm3_portal', act: 1 }, { id: 'm4_caucaso', act: 1 },
  { id: 'm5_itaca', act: 2 }, { id: 'm6_estatua', act: 2 }, { id: 'm7_aquiles', act: 2 }, { id: 'm8_oceano', act: 2 },
  { id: 'm9_tenaro', act: 3 }, { id: 'm10_otris', act: 3 }, { id: 'm11_chamas', act: 3 }, { id: 'm12_titanomaquia', act: 3 },
];

/** Missões do prólogo (selo "Prólogo" no Ato I; conquista campaign_prologue). */
export const PROLOGUE_IDS: readonly string[] = ['m1_despertar', 'm2_cerco', 'm3_portal'];

/** Ids oficiais de um ato (inclusive os que ainda não têm arquivo). */
export function actMissionIds(act: CampaignAct): string[] { return CAMPAIGN_PLAN.filter((m) => m.act === act).map((m) => m.id); }
