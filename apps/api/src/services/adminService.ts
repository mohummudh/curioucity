import { store } from "../stores/inMemoryStore.js";
import type { PolicyConfig } from "../types/domain.js";

const voices = [
  { provider: "gemini", archetype: "playful", voiceId: "Puck", label: "Puck" },
  { provider: "gemini", archetype: "wise", voiceId: "Kore", label: "Kore" },
  { provider: "gemini", archetype: "adventurous", voiceId: "Zephyr", label: "Zephyr" },
  { provider: "gemini", archetype: "inventor", voiceId: "Charon", label: "Charon" },
  { provider: "elevenlabs", archetype: "playful", voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Spark" },
  { provider: "elevenlabs", archetype: "wise", voiceId: "MF3mGyEYCl7XYWbV9V6O", label: "Guide" },
  { provider: "elevenlabs", archetype: "adventurous", voiceId: "TxGEqnHWrfWFTfGW9XjX", label: "Explorer" },
  { provider: "elevenlabs", archetype: "inventor", voiceId: "pNInz6obpgDQGcFmaJgB", label: "Inventor" },
];

export class AdminService {
  getPolicy(): PolicyConfig {
    return store.policy;
  }

  updatePolicy(input: Partial<PolicyConfig>): PolicyConfig {
    store.policy = {
      ...store.policy,
      ...input,
    };
    return store.policy;
  }

  getIncidents() {
    return store.incidents.slice(-200).reverse();
  }

  getVoices() {
    return voices;
  }
}

export const adminService = new AdminService();
