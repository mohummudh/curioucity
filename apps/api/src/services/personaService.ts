import type { CanonicalEntity, FactItem, FactPack, PersonaArchetype, PersonaProfile } from "../types/domain.js";

const archetypeByCategory: Record<CanonicalEntity["category"], PersonaArchetype> = {
  landmark: "wise",
  nature: "adventurous",
  statue: "wise",
  electronics: "inventor",
  science: "inventor",
  animal: "playful",
  other: "adventurous",
};

const styleByArchetype: Record<PersonaArchetype, string> = {
  playful: "bouncy, energetic, and curious",
  wise: "warm, confident, and story-rich",
  adventurous: "excited, exploratory, and vivid",
  inventor: "clever, hands-on, and discovery-driven",
};

const objectHookTemplates = [
  "Psst... want to hear a secret? I'm {name}!",
  "Whoa, you found me! I'm {name}. Ready for a surprise?",
  "Guess what? I'm {name}. Wanna hear my wildest fact?",
  "Adventure alert! I'm {name}. Ready to be amazed?",
];

const characterHookTemplates = [
  "Psst... it's really me, {name}! Want my biggest secret?",
  "You spotted me! I'm {name}. Wanna know why people still talk about me?",
  "Time-travel moment: I'm {name}. Ready for a jaw-dropping clue?",
  "History hook: I'm {name}. Want to know what changed everything for me?",
];

const curiosityQuestionsByCategory: Record<CanonicalEntity["category"], string[]> = {
  landmark: [
    "If you could visit me, what mystery would you solve first?",
    "What do you think people felt the first time they saw me?",
  ],
  nature: [
    "What tiny creature do you think depends on me the most?",
    "How do you think I change between seasons?",
  ],
  statue: [
    "What part of my story do you want to explore next?",
    "Want to know the one thing people get wrong about me?",
    "If you made a monument about history, who would it feature?",
  ],
  electronics: [
    "Which sensor would you add to invent something new?",
    "What problem would you solve with a gadget like me?",
  ],
  science: [
    "What experiment would you run with me first?",
    "What question could we test like scientists?",
  ],
  animal: [
    "What do you think helps me survive in the wild?",
    "If you observed me for a day, what would you write down?",
  ],
  other: [
    "What do you notice first that most people might miss?",
    "What question about me makes you most curious?",
  ],
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toFirstPersonFact = (fact: FactItem | undefined, entity: CanonicalEntity): string => {
  if (!fact) {
    return `${entity.roleplayName} has a story worth exploring.`;
  }

  let rewritten = fact.claim;
  const candidates = [entity.roleplayName, entity.researchSubject, entity.label].filter(Boolean);

  for (const candidate of candidates) {
    rewritten = rewritten.replace(new RegExp(`\\b${escapeRegex(candidate)}\\b`, "gi"), "I");
  }

  rewritten = rewritten
    .replace(/\bthe\s+bust\s+of\s+me\b/gi, "me")
    .replace(/\bthe\s+statue\s+of\s+me\b/gi, "me")
    .replace(/\bthe\s+portrait\s+of\s+me\b/gi, "me");

  return rewritten;
};

export class PersonaService {
  buildPersona(entity: CanonicalEntity): PersonaProfile {
    let voiceArchetype = archetypeByCategory[entity.category] ?? "adventurous";

    if (entity.roleplayMode === "as_character" && entity.category === "statue") {
      voiceArchetype = "wise";
    }

    return {
      voiceArchetype,
      speakingStyle: styleByArchetype[voiceArchetype],
      hookTemplateId: `${voiceArchetype}-hook-1`,
    };
  }

  buildHook(entity: CanonicalEntity): string {
    const templates = entity.roleplayMode === "as_character" ? characterHookTemplates : objectHookTemplates;
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace("{name}", entity.roleplayName);
  }

  buildFirstReply(input: { factPack: FactPack; hook: string }): string {
    const firstFact = toFirstPersonFact(input.factPack.facts[0], input.factPack.entity);
    const secondFact = toFirstPersonFact(input.factPack.facts[1], input.factPack.entity);
    const question = this.getCuriosityQuestion(input.factPack.entity);

    const identityLine =
      input.factPack.entity.roleplayMode === "as_character"
        ? `I'm ${input.factPack.entity.roleplayName}, and yep, this is my real story.`
        : `I'm ${input.factPack.entity.roleplayName}, and here's what makes me amazing.`;

    return [input.hook, identityLine, firstFact, secondFact, question].join(" ");
  }

  buildFallbackReply(input: { factPack: FactPack; userQuestion: string; usedFactIndexes: Set<number> }): string {
    const freshFact = this.pickFreshFact(input.factPack, input.usedFactIndexes);
    const question = this.getCuriosityQuestion(input.factPack.entity);

    const intro =
      input.factPack.entity.roleplayMode === "as_character"
        ? `Great question! I'm ${input.factPack.entity.roleplayName}.`
        : `Great question! I'm ${input.factPack.entity.roleplayName}.`;

    return [
      intro,
      `Here's something awesome: ${toFirstPersonFact(freshFact, input.factPack.entity)}`,
      `You asked: "${input.userQuestion}" and I love that curiosity.`,
      question,
    ].join(" ");
  }

  pickFreshFact(factPack: FactPack, usedFactIndexes: Set<number>) {
    for (let idx = 0; idx < factPack.facts.length; idx += 1) {
      if (!usedFactIndexes.has(idx)) {
        usedFactIndexes.add(idx);
        return factPack.facts[idx];
      }
    }

    return factPack.facts[0];
  }

  getCuriosityQuestion(entity: CanonicalEntity): string {
    const candidates = curiosityQuestionsByCategory[entity.category] ?? curiosityQuestionsByCategory.other;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

export const personaService = new PersonaService();
