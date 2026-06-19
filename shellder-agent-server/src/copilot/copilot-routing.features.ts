import { CapabilityType } from '@prisma/client';

export type CopilotRoutingMode = 'auto' | 'pinned' | 'hybrid';

export interface CopilotRoutingFeatures {
  routingMode?: CopilotRoutingMode;
  showCapabilitySelector?: boolean;
  clarifyOnLowConfidence?: boolean;
  confidenceThreshold?: number;
  allowedCapabilities?: CapabilityType[];
}

export interface CopilotFeatures extends CopilotRoutingFeatures {
  enableHistory?: boolean;
  enableTask?: boolean;
  enableConfirmation?: boolean;
  [key: string]: unknown;
}

const DEFAULT_COPILOT_FEATURES: CopilotFeatures = {
  enableHistory: true,
  enableTask: true,
  enableConfirmation: true,
  routingMode: 'auto',
  showCapabilitySelector: false,
  clarifyOnLowConfidence: true,
  confidenceThreshold: 0.4,
};

export function mergeCopilotFeatures(raw: unknown): CopilotFeatures {
  const base = { ...DEFAULT_COPILOT_FEATURES };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }
  const input = raw as Record<string, unknown>;
  return {
    ...base,
    ...input,
    routingMode: normalizeRoutingMode(input.routingMode),
    confidenceThreshold: normalizeConfidenceThreshold(input.confidenceThreshold),
  };
}

export function resolveRoutingMode(features: CopilotFeatures): CopilotRoutingMode {
  return features.routingMode ?? 'auto';
}

function normalizeRoutingMode(value: unknown): CopilotRoutingMode {
  if (value === 'pinned' || value === 'hybrid' || value === 'auto') {
    return value;
  }
  return 'auto';
}

function normalizeConfidenceThreshold(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_COPILOT_FEATURES.confidenceThreshold!;
  }
  return Math.min(1, Math.max(0, value));
}
