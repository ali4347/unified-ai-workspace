import type {
  ProviderError,
  ProviderErrorCode,
  ProviderSlug,
} from "@uaw/types";

/** Normalized provider errors (PRD §47). */

const RECOVERABLE: Record<ProviderErrorCode, boolean> = {
  LOGIN_REQUIRED: true,
  SESSION_EXPIRED: true,
  MODEL_UNAVAILABLE: true,
  USAGE_LIMIT: true,
  PROVIDER_CHANGED: true,
  NETWORK_ERROR: true,
  UNSUPPORTED_ACTION: false,
};

export class ProviderAdapterError extends Error implements ProviderError {
  readonly code: ProviderErrorCode;
  readonly provider: ProviderSlug;
  readonly recoverable: boolean;

  constructor(code: ProviderErrorCode, provider: ProviderSlug, message: string) {
    super(message);
    this.name = "ProviderAdapterError";
    this.code = code;
    this.provider = provider;
    this.recoverable = RECOVERABLE[code];
  }
}

export function providerError(
  code: ProviderErrorCode,
  provider: ProviderSlug,
  message: string
): ProviderAdapterError {
  return new ProviderAdapterError(code, provider, message);
}

export function isProviderError(value: unknown): value is ProviderAdapterError {
  return value instanceof ProviderAdapterError;
}
