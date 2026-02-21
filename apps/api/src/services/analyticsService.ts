import { store } from "../stores/inMemoryStore.js";
import type { AnalyticsEvent, AnalyticsEventName } from "../types/domain.js";

export class AnalyticsService {
  track(eventName: AnalyticsEventName, sessionId: string, metadata: Record<string, string | number | boolean | null> = {}): void {
    const item: AnalyticsEvent = {
      eventName,
      sessionId,
      metadata,
      createdAt: new Date().toISOString(),
    };

    store.analytics.push(item);
  }

  getDashboard(): {
    totalSessions: number;
    totalUploads: number;
    averageTurnsPerSession: number;
    safetyIncidents: number;
    events: AnalyticsEvent[];
  } {
    const sessions = new Set(store.analytics.map((event) => event.sessionId));
    const uploads = store.analytics.filter((event) => event.eventName === "upload_started").length;
    const turns = store.analytics.filter((event) => event.eventName === "chat_turn").length;

    return {
      totalSessions: sessions.size,
      totalUploads: uploads,
      averageTurnsPerSession: sessions.size > 0 ? Number((turns / sessions.size).toFixed(2)) : 0,
      safetyIncidents: store.incidents.length,
      events: store.analytics.slice(-100),
    };
  }
}

export const analyticsService = new AnalyticsService();
