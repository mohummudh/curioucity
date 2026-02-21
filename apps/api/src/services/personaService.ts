import type { CanonicalEntity, FactPack, PersonaArchetype, PersonaProfile } from "../types/domain.js";

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

const hookTemplates = [
  "Psst... want to hear a secret? I'm {label}, and I hide amazing clues!",
  "Whoa, you found me! I'm {label}, and my story is full of surprises!",
  "Guess what? I'm {label}, and I can blow your mind in under a minute!",
  "Adventure alert! I'm {label}, and I've got a wow-fact ready for you!",
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
    "If you made a statue, who or what would it honor?",
    "What pose would your statue make to tell a story?",
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

export class PersonaService {
  buildPersona(entity: CanonicalEntity): PersonaProfile {
    const voiceArchetype = archetypeByCategory[entity.category] ?? "adventurous";
    return {
      voiceArchetype,
      speakingStyle: styleByArchetype[voiceArchetype],
      hookTemplateId: `${voiceArchetype}-hook-1`,
    };
  }

  buildHook(entity: CanonicalEntity): string {
    const template = hookTemplates[Math.floor(Math.random() * hookTemplates.length)];
    return template.replace("{label}", entity.label);
  }

  buildFirstReply(input: { factPack: FactPack; hook: string }): string {
    const [first, second] = input.factPack.facts;
    const facts = [first?.claim, second?.claim].filter(Boolean);
    const question = this.getCuriosityQuestion(input.factPack.entity);

    const parts = [input.hook];
    for (const fact of facts) {
      parts.push(fact as string);
    }
    parts.push(question);

    return parts.join(" ");
  }

  buildFallbackReply(input: { factPack: FactPack; userQuestion: string; usedFactIndexes: Set<number> }): string {
    const freshFact = this.pickFreshFact(input.factPack, input.usedFactIndexes);
    const question = this.getCuriosityQuestion(input.factPack.entity);

    return [
      `Great question! As ${input.factPack.entity.label}, here's something awesome:`,
      freshFact?.claim ?? input.factPack.summary,
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
