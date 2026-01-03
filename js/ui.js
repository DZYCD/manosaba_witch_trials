// UI 控制
const UI = {
    elements: {},

    init() {
        this.elements = {
            settingsPanel: document.getElementById('settings-panel'),
            gameContainer: document.getElementById('game-container'),
            apiUrl: document.getElementById('api-url'),
            apiKey: document.getElementById('api-key'),
            modelName: document.getElementById('model-name'),
            saveSettings: document.getElementById('save-settings'),
            openSettings: document.getElementById('open-settings'),
            roundInfo: document.getElementById('round-info'),
            timerInfo: document.getElementById('timer-info'),
            phaseInfo: document.getElementById('phase-info'),
            caseInfo: document.getElementById('case-info'),
            chatMessages: document.getElementById('chat-messages'),
            inputArea: document.getElementById('input-area'),
            playerInput: document.getElementById('player-input'),
            sendBtn: document.getElementById('send-btn'),
            votePanel: document.getElementById('vote-panel'),
            voteOptions: document.getElementById('vote-options'),
            submitVote: document.getElementById('submit-vote'),
            startGame: document.getElementById('start-game'),
            nextTurn: document.getElementById('next-turn')
        };
    },

    // 显示/隐藏设置面板
    showSettings(show = true) {
        this.elements.settingsPanel.classList.toggle('hidden', !show);
    },

    // 显示游戏界面
    showGame() {
        this.elements.gameContainer.classList.remove('hidden');
        this.showSettings(false);
    },

    // 加载配置到表单
    loadConfigToForm(config) {
        this.elements.apiUrl.value = config.apiUrl || '';
        this.elements.apiKey.value = config.apiKey || '';
        this.elements.modelName.value = config.model || 'gpt-4o-mini';
    },

    // 从表单获取配置
    getConfigFromForm() {
        return {
            apiUrl: this.elements.apiUrl.value.trim(),
            apiKey: this.elements.apiKey.value.trim(),
            model: this.elements.modelName.value.trim() || 'gpt-4o-mini'
        };
    },

    // 更新游戏信息
    updateGameInfo(round, maxRounds, phase, cluePhase = 1) {
        this.elements.roundInfo.textContent = `轮次: ${round}/${maxRounds}`;
        const phaseText = { discussion: '讨论中', voting: '投票中', ended: '已结束' };
        // 不显示具体阶段信息
        this.elements.phaseInfo.textContent = phaseText[phase] || phase;
    },

    // 更新计时器显示
    updateTimer(remainingMs) {
        if (remainingMs <= 0) {
            this.elements.timerInfo.textContent = '⏰ 00:00';
            this.elements.timerInfo.classList.add('timer-urgent');
            return;
        }
        
        const minutes = Math.floor(remainingMs / 60000);
        const seconds = Math.floor((remainingMs % 60000) / 1000);
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.elements.timerInfo.textContent = `⏰ ${timeStr}`;
        
        // 最后5分钟变红
        if (remainingMs <= 5 * 60 * 1000) {
            this.elements.timerInfo.classList.add('timer-warning');
        } else {
            this.elements.timerInfo.classList.remove('timer-warning');
        }
        
        // 最后1分钟闪烁
        if (remainingMs <= 60 * 1000) {
            this.elements.timerInfo.classList.add('timer-urgent');
        } else {
            this.elements.timerInfo.classList.remove('timer-urgent');
        }
    },

    // 隐藏计时器
    hideTimer() {
        this.elements.timerInfo.textContent = '';
        this.elements.timerInfo.classList.remove('timer-warning', 'timer-urgent');
    },

    // 显示案件信息
    showCaseInfo(caseData) {
        const victim = Characters.get(caseData.victim);
        this.elements.caseInfo.innerHTML = `
            <p><strong>受害者：</strong>${victim.name}</p>
            <p><strong>地点：</strong>${caseData.location}</p>
            <p><strong>时间：</strong>${caseData.time}</p>
            <p>${caseData.publicInfo}</p>
        `;
    },

    // 添加消息到聊天区
    addMessage(speaker, content, type = 'normal') {
        const char = Characters.get(speaker);
        const div = document.createElement('div');
        div.className = `message ${type}`;
        
        const name = char ? char.name : speaker;
        const color = char ? char.color : '#fff';
        
        div.innerHTML = `
            <div class="speaker" style="color: ${color}">${name}</div>
            <div class="content">${content}</div>
        `;
        
        this.elements.chatMessages.appendChild(div);
        this.scrollToBottom();
    },

    // 添加系统消息
    addSystemMessage(content) {
        const div = document.createElement('div');
        div.className = 'message warden';
        div.innerHTML = `
            <div class="speaker">典狱长</div>
            <div class="content">${content}</div>
        `;
        this.elements.chatMessages.appendChild(div);
        this.scrollToBottom();
    },

    // 显示加载状态
    showLoading(show = true) {
        if (show) {
            const div = document.createElement('div');
            div.id = 'loading-indicator';
            div.className = 'message';
            div.innerHTML = '<div class="loading"></div> 思考中...';
            this.elements.chatMessages.appendChild(div);
            this.scrollToBottom();
        } else {
            const loading = document.getElementById('loading-indicator');
            if (loading) loading.remove();
        }
    },

    // 滚动到底部
    scrollToBottom() {
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    },

    // 显示玩家输入区
    showPlayerInput(show = true) {
        this.elements.inputArea.classList.toggle('hidden', !show);
        if (show) {
            this.elements.playerInput.value = '';
            this.elements.playerInput.focus();
        }
    },

    // 高亮输入框（轮到玩家发言时）
    highlightInput(highlight = true) {
        const inputArea = this.elements.inputArea;
        const inputHint = inputArea.querySelector('.input-hint');
        
        if (highlight) {
            inputArea.classList.add('highlight');
            inputHint.classList.add('urgent');
            inputHint.textContent = '🎤 轮到你发言了，樱羽艾玛！';
            this.elements.playerInput.focus();
            // 播放提示音（可选）
            this.playNotificationSound();
        } else {
            inputArea.classList.remove('highlight');
            inputHint.classList.remove('urgent');
            inputHint.textContent = '随时可以插话，樱羽艾玛';
        }
    },

    // 播放提示音
    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;
            
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (e) {
            // 忽略音频错误
        }
    },

    // 显示投票面板
    showVotePanel(characters) {
        this.elements.votePanel.classList.remove('hidden');
        this.elements.inputArea.classList.add('hidden');
        
        // 初始化投票进度
        this.updateVoteProgress({});
        
        this.elements.voteOptions.innerHTML = characters
            .map(c => `<div class="vote-option" data-id="${c.id}">${c.name}</div>`)
            .join('');

        // 绑定点击事件
        this.elements.voteOptions.querySelectorAll('.vote-option').forEach(el => {
            el.addEventListener('click', () => {
                this.elements.voteOptions.querySelectorAll('.vote-option')
                    .forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
            });
        });
    },

    // 更新投票进度显示
    updateVoteProgress(votes) {
        const progressEl = document.getElementById('vote-progress');
        if (!progressEl) return;

        // 统计票数
        const counts = {};
        let totalVotes = 0;
        for (const data of Object.values(votes)) {
            if (data.target) {
                counts[data.target] = (counts[data.target] || 0) + 1;
                totalVotes++;
            }
        }

        if (totalVotes === 0) {
            progressEl.innerHTML = `
                <div class="vote-progress-title">投票进度：0/12</div>
                <div class="vote-progress-bar"></div>
            `;
            return;
        }

        // 生成颜色
        const colors = [
            '#e94560', '#4a9', '#ffa500', '#9370db', '#1e90ff',
            '#ffd700', '#ff6b6b', '#00ff37', '#ffcc00', '#dc143c',
            '#8b008b', '#708090', '#e6e6fa'
        ];

        // 生成进度条
        let barHtml = '';
        let legendHtml = '';
        let colorIndex = 0;

        const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        
        for (const [charId, count] of sortedCounts) {
            const char = Characters.get(charId);
            const name = char ? char.name : charId;
            const percent = (count / totalVotes) * 100;
            const color = colors[colorIndex % colors.length];
            
            barHtml += `<div class="vote-progress-segment" style="width: ${percent}%; background: ${color};">${count}</div>`;
            legendHtml += `<div class="vote-legend-item"><span class="vote-legend-color" style="background: ${color};"></span>${name}: ${count}票</div>`;
            
            colorIndex++;
        }

        progressEl.innerHTML = `
            <div class="vote-progress-title">投票进度：${totalVotes}/12</div>
            <div class="vote-progress-bar">${barHtml}</div>
            <div class="vote-progress-legend">${legendHtml}</div>
        `;
    },

    // 获取玩家投票选择
    getSelectedVote() {
        const selected = this.elements.voteOptions.querySelector('.vote-option.selected');
        return selected ? selected.dataset.id : null;
    },

    // 隐藏投票面板
    hideVotePanel() {
        this.elements.votePanel.classList.add('hidden');
    },

    // 清空聊天记录
    clearChat() {
        this.elements.chatMessages.innerHTML = '';
    },

    // 显示/隐藏按钮
    showStartButton(show = true) {
        this.elements.startGame.classList.toggle('hidden', !show);
    },

    showNextButton(show = true) {
        this.elements.nextTurn.classList.toggle('hidden', !show);
    },

    // 禁用/启用按钮
    setButtonsEnabled(enabled) {
        this.elements.startGame.disabled = !enabled;
        this.elements.nextTurn.disabled = !enabled;
        this.elements.sendBtn.disabled = !enabled;
        this.elements.submitVote.disabled = !enabled;
    }
};
