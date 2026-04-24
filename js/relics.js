/**
 * Relic / Charm System
 * ====================
 * Players can equip up to MAX_SLOTS relics simultaneously.
 * Each relic provides a passive bonus applied via applyToPlayer().
 *
 * How to use:
 *   RelicSystem.equip('longerBlade');
 *   RelicSystem.applyToPlayer(player);   // call after player is created/respawned
 */

const RELIC_DEFS = {
  longerBlade: {
    id:   'longerBlade',
    name: 'Void Edge',
    desc: 'Extends sword reach by 40%.',
    icon: '⚔',
    apply(p) { p.attackRange    *= 1.4; },
  },
  quickHeal: {
    id:   'quickHeal',
    name: 'Soul Bloom',
    desc: 'Healing focus is 30% faster.',
    icon: '❤',
    apply(p) { p.focusDuration  *= 0.7; },
  },
  soulHarvest: {
    id:   'soulHarvest',
    name: 'Hungry Ghost',
    desc: 'Gain +2 extra soul per hit.',
    icon: '◈',
    apply(p) { p.soulPerHit     += 2; },
  },
  swiftDash: {
    id:   'swiftDash',
    name: 'Phase Wraith',
    desc: 'Dash cooldown reduced by 25%.',
    icon: '💨',
    apply(p) { p.dashCooldownMax = Math.floor(p.dashCooldownMax * 0.75); },
  },
  ironShell: {
    id:   'ironShell',
    name: 'Iron Shell',
    desc: '+1 max health mask.',
    icon: '🛡',
    apply(p) { p.maxHealth      += 1; p.health = Math.min(p.health + 1, p.maxHealth); },
  },
  deepFocus: {
    id:   'deepFocus',
    name: 'Deep Focus',
    desc: 'Heals 2 masks per Focus instead of 1.',
    icon: '✦',
    apply(p) { p.focusHealAmount = 2; },
  },
};

const MAX_SLOTS = 3;

const RelicSystem = (() => {
  let equipped = []; // array of relic IDs

  function equip(id) {
    if (!RELIC_DEFS[id]) return false;
    if (equipped.includes(id)) return false;
    if (equipped.length >= MAX_SLOTS) return false;
    equipped.push(id);
    return true;
  }

  function unequip(id) {
    equipped = equipped.filter(r => r !== id);
  }

  function getEquipped() { return [...equipped]; }
  function getAll()      { return Object.values(RELIC_DEFS); }

  /** Apply all equipped relics to player. Call after player reset. */
  function applyToPlayer(player) {
    for (const id of equipped) {
      RELIC_DEFS[id]?.apply(player);
    }
  }

  function isEquipped(id) { return equipped.includes(id); }

  return { equip, unequip, getEquipped, getAll, applyToPlayer, isEquipped, MAX_SLOTS };
})();
