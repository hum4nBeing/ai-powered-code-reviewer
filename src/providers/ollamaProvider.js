import { BaseProvider } from './baseProvider.js';

export class OllamaProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.modelName = config.model || 'llama3';
  }

  async callModel(systemPrompt, userPrompt) {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          format: 'json',
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const text = data.message?.content || '';
      const usage = {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0
      };

      return { text, usage };
    } catch (err) {
      throw new Error(`Ollama API Error (${this.baseUrl}): ${this.formatErrorMessage(err)}`);
    }
  }

  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return (data.models || []).map(m => m.name);
    } catch (err) {
      throw new Error(`Ollama API Error (${this.baseUrl}): ${this.formatErrorMessage(err)}`);
    }
  }
}
