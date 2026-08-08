import { BaseProvider } from './baseProvider.js';

export class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    if (!this.apiKey) {
      throw new Error('OpenAI API Key is missing. Run `review init` or `review config -k YOUR_KEY`.');
    }
    this.modelName = config.model || 'gpt-4o';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async callModel(systemPrompt, userPrompt) {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const usageData = data.usage || {};
      const usage = {
        promptTokens: usageData.prompt_tokens || 0,
        completionTokens: usageData.completion_tokens || 0
      };

      return { text, usage };
    } catch (err) {
      throw new Error(`OpenAI API Error: ${this.formatErrorMessage(err)}`);
    }
  }

  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return (data.data || []).map(m => m.id);
    } catch (err) {
      throw new Error(`OpenAI API Error: ${this.formatErrorMessage(err)}`);
    }
  }
}
