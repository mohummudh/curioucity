import { randomUUID } from "node:crypto";
import { store } from "../stores/inMemoryStore.js";
import type { ConversationTurn, SafetyVerdict } from "../types/domain.js";
import { analyticsService } from "./analyticsService.js";
import { geminiClient } from "./providers/geminiClient.js";
import { moderationService } from "./moderationService.js";
import { personaService } from "./personaService.js";
import { speechService } from "./speechService.js";
import { voiceService } from "./voiceService.js";

export class ConversationService {
  async chatTurn(input: {
    sessionId: string;
    conversationId: string;
    text?: string;
    audioBlobUrl?: string;
  }): Promise<{
    turn: ConversationTurn;
    replyAudioStreamUrl?: string;
    followupSuggestions: string[];
  }> {
    const conversation = store.conversations.get(input.conversationId);
    if (!conversation || conversation.sessionId !== input.sessionId) {
      throw new Error("Conversation not found");
    }

    let userText = input.text?.trim();
    if (!userText && input.audioBlobUrl) {
      userText = (await speechService.transcribeFromUrl(input.audioBlobUrl)) ?? "";
    }

    if (!userText || userText.length === 0) {
      throw new Error("No user input provided");
    }

    const moderatedInput = moderationService.moderateInput(input.sessionId, userText);
    const safeInput = moderatedInput.transformedText ?? userText;

    const recentTurns = conversation.turns.slice(-4).map((turn) => ({
      user: turn.userInput,
      assistant: turn.assistantText,
    }));

    const freshFact = personaService.pickFreshFact(conversation.factPack, conversation.usedFactIndexes);
    const candidateFacts = [freshFact, ...conversation.factPack.facts.slice(0, 2)].filter(
      (fact): fact is (typeof conversation.factPack.facts)[number] => Boolean(fact),
    );

    const generatedReply = await geminiClient.generateFollowupReply({
      entity: conversation.entity,
      question: safeInput,
      summary: conversation.factPack.summary,
      candidateFacts,
      recentTurns,
    });

    const fallbackReply = personaService.buildFallbackReply({
      factPack: conversation.factPack,
      userQuestion: safeInput,
      usedFactIndexes: conversation.usedFactIndexes,
    });

    const draftReply = generatedReply ?? fallbackReply;
    const moderatedOutput = moderationService.moderateOutput(input.sessionId, draftReply);

    const replyText =
      moderatedInput.verdict === "block"
        ? moderatedInput.transformedText ?? "Let's switch to a safe and fun science question."
        : moderatedOutput.transformedText ?? draftReply;

    const finalVerdict: SafetyVerdict =
      moderatedInput.verdict === "block"
        ? "block"
        : moderatedOutput.verdict === "transform"
          ? "transform"
          : "allow";

    const turn: ConversationTurn = {
      turnId: randomUUID(),
      userInput: safeInput,
      assistantText: replyText,
      safetyVerdict: finalVerdict,
      createdAt: new Date().toISOString(),
    };

    conversation.turns.push(turn);
    conversation.updatedAt = new Date().toISOString();
    store.conversations.set(conversation.conversationId, conversation);

    const voiceAsset = await voiceService.synthesizeToAsset({
      text: replyText,
      archetype: conversation.persona.voiceArchetype,
    });

    analyticsService.track("chat_turn", input.sessionId, {
      conversationId: input.conversationId,
      verdict: finalVerdict,
      hasAudio: Boolean(voiceAsset),
    });

    return {
      turn,
      replyAudioStreamUrl: voiceAsset?.streamUrl,
      followupSuggestions: [
        personaService.getCuriosityQuestion(conversation.entity),
        "Want another surprising fact?",
        `Ask me how ${conversation.entity.roleplayName} changes over time!`,
      ],
    };
  }
}

export const conversationService = new ConversationService();
