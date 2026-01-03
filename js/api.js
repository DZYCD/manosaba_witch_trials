// OpenAI API 调用
const API = {
    config: null,

    init(config) {
        this.config = config;
    },

    async chat(systemPrompt, userPrompt) {
        if (!this.config || !this.config.apiKey) {
            throw new Error('API 未配置');
        }

        const response = await fetch(this.config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.8,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API 错误: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }
};
