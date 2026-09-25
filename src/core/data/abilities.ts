// Habilidades ativas dos heróis (Fase 5.2): comando 'ability', com recarga e efeito temporário (buff) determinístico.
export type AbilityEffect = 'attack' | 'speed' | 'charge' | 'haste' | 'ward';
export interface AbilityDef { id: string; name: string; icon: string; desc: string; cooldown: number; duration: number; radius: number; effect: AbilityEffect; power: number }

export const ABILITIES: Record<string, AbilityDef> = {
  war_cry: { id: 'war_cry', name: 'Grito dos Argonautas', icon: '📣', desc: 'Jasão e aliados a até 6 tiles ganham +30% de ataque por 15 s.', cooldown: 60, duration: 15, radius: 6, effect: 'attack', power: 1.3 },
  cunning: { id: 'cunning', name: 'Astúcia', icon: '💨', desc: 'Odisseu e aliados a até 6 tiles ganham +40% de velocidade por 10 s.', cooldown: 45, duration: 10, radius: 6, effect: 'speed', power: 1.4 },
  titanic_blow: { id: 'titanic_blow', name: 'Golpe Titânico', icon: '💥', desc: 'O próximo golpe de Héracles (em até 20 s) causa dano triplo e atinge inimigos a 2 tiles.', cooldown: 40, duration: 20, radius: 2, effect: 'charge', power: 3 },
  fury: { id: 'fury', name: 'Fúria de Aquiles', icon: '🔥', desc: 'Aquiles ataca duas vezes mais rápido por 10 s.', cooldown: 50, duration: 10, radius: 0, effect: 'haste', power: 2 },
  mirror_shield: { id: 'mirror_shield', name: 'Escudo Espelhado', icon: '🪞', desc: 'Perseu e aliados a até 5 tiles ficam imunes à petrificação e sofrem só 30% do dano divino por 12 s.', cooldown: 60, duration: 12, radius: 5, effect: 'ward', power: 0.3 },
};
