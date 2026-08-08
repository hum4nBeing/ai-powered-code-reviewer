import { GeminiProvider } from './geminiProvider.js';
import { OpenAIProvider } from './openaiProvider.js';
import { OllamaProvider } from './ollamaProvider.js';

/**
 * Strategy Factory to create the correct Provider instance based on configuration.
 * @param {Object} config 
 * @returns {import('./baseProvider.js').BaseProvider}
 */
export function createProvider(config) {
  if (!config || !config.provider) {
    throw new Error('Provider configuration is missing. Run `review init` or `review config -p <provider>` first.');
  }

  const providerName = config.provider.toLowerCase();

  switch (providerName) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unsupported provider "${config.provider}". Supported providers: gemini, openai, ollama.`);
  }
}
