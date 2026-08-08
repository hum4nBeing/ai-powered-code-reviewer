import { GoogleGenAI } from '@google/genai';
import { BaseProvider } from './baseProvider.js';

export class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    if (!this.apiKey) {
      throw new Error('Gemini API Key is missing. Run `review init` or `review config -k YOUR_KEY`.');
    }
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    this.modelName = config.model || 'gemini-2.0-flash';
  }

  async callModel(systemPrompt, userPrompt) {
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = response.text || '';
      const usageMetadata = response.usageMetadata || {};
      const usage = {
        promptTokens: usageMetadata.promptTokenCount || 0,
        completionTokens: usageMetadata.candidatesTokenCount || 0
      };

      return { text, usage };
    } catch (err) {
      throw new Error(`Gemini API Error: ${this.formatErrorMessage(err)}`);
    }
  }

  async getAvailableModels() {
    try {
      const res = await this.ai.models.list();
      const models = [];
      for await (const m of res) {
        if (!m.supportedActions || m.supportedActions.includes('generateContent')) {
          const name = m.name ? m.name.replace(/^models\//, '') : '';
          if (name && !models.includes(name)) {
            models.push(name);
          }
        }
      }
      return models;
    } catch (err) {
      throw new Error(`Gemini API Error: ${this.formatErrorMessage(err)}`);
    }
  }
}
