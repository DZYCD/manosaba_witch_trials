// 配置管理 - 使用 Cookie 存储
const Config = {
    COOKIE_NAME: 'witch_trial_config',
    COOKIE_DAYS: 30,

    defaults: {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-4o-mini'
    },

    save(config) {
        const data = JSON.stringify(config);
        const expires = new Date(Date.now() + this.COOKIE_DAYS * 864e5).toUTCString();
        document.cookie = `${this.COOKIE_NAME}=${encodeURIComponent(data)}; expires=${expires}; path=/`;
    },

    load() {
        const match = document.cookie.match(new RegExp(`${this.COOKIE_NAME}=([^;]+)`));
        if (match) {
            try {
                return { ...this.defaults, ...JSON.parse(decodeURIComponent(match[1])) };
            } catch (e) {
                console.error('配置解析失败', e);
            }
        }
        return { ...this.defaults };
    },

    isValid(config) {
        return config.apiUrl && config.apiKey;
    }
};
