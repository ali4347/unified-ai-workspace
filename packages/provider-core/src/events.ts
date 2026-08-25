import type { ProviderEventType, ProviderSlug } from "@uaw/types";

/**
 * Lightweight provider event bus (PRD §31 provider_events). The web app
 * subscribes and persists events; adapters and the registry emit them.
 */
export interface ProviderEvent {
  type: ProviderEventType | "provider_switched" | "context_handoff";
  provider: ProviderSlug;
  detail?: Record<string, string>;
}

type Listener = (event: ProviderEvent) => void;

export class ProviderEventBus {
  private listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ProviderEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A faulty listener must never break provider flow.
      }
    }
  }
}
