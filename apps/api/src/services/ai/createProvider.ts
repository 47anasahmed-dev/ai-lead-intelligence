/**
 * Server-side AI provider factory.
 * Shared createAiProvider only ships Noop; this wires OpenAI / OpenRouter when configured.
 */

import { createAiProvider, NoopAiProvider, type AiProvider } from '@ali/shared';
import { env } from '../../lib/env.js';
import { OpenAiProvider } from './openAiProvider.js';
import { OpenRouterProvider } from './openRouterProvider.js';

let loggedMissingKey = false;

function warnMissingKey(kind: string, envVar: string): void {
  if (!loggedMissingKey) {
    loggedMissingKey = true;
    console.warn(
      `[ai] AI_PROVIDER=${kind} but ${envVar} is missing — using NoopAiProvider`,
    );
  }
}

export function createServerAiProvider(): AiProvider {
  const kind = (env.aiProvider ?? 'noop').toString().trim().toLowerCase();

  if (kind === 'openai') {
    if (!env.openAiApiKey) {
      warnMissingKey('openai', 'OPENAI_API_KEY');
      return new NoopAiProvider();
    }
    return new OpenAiProvider({
      apiKey: env.openAiApiKey,
      model: env.openAiModel,
    });
  }

  if (kind === 'openrouter') {
    if (!env.openRouterApiKey) {
      warnMissingKey('openrouter', 'OPENROUTER_API_KEY');
      return new NoopAiProvider();
    }
    return new OpenRouterProvider({
      apiKey: env.openRouterApiKey,
      model: env.openRouterModel,
    });
  }

  return createAiProvider(kind);
}

export function isLiveAiEnabled(): boolean {
  const kind = (env.aiProvider ?? 'noop').toString().trim().toLowerCase();
  if (kind === 'openai') return Boolean(env.openAiApiKey);
  if (kind === 'openrouter') return Boolean(env.openRouterApiKey);
  return false;
}
