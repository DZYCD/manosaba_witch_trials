// 主程序入口
(function () {
    let isProcessing = false;
    let gameTimer = null;  // 30分钟计时器
    let timerInterval = null;  // 计时器更新间隔
    let gameStartTime = null;  // 游戏开始时间
    const GAME_TIME_LIMIT = 30 * 60 * 1000;  // 30分钟

    // 初始化
    function init() {
        UI.init();

        const config = Config.load();
        UI.loadConfigToForm(config);

        if (Config.isValid(config)) {
            API.init(config);
            UI.showGame();
        }

        bindEvents();
    }

    // 绑定事件
    function bindEvents() {
        UI.elements.saveSettings.addEventListener('click', () => {
            const config = UI.getConfigFromForm();
            if (!Config.isValid(config)) {
                alert('请填写 API URL 和 API Key');
                return;
            }
            Config.save(config);
            API.init(config);
            UI.showGame();
        });

        UI.elements.openSettings.addEventListener('click', () => {
            UI.showSettings(true);
        });

        UI.elements.startGame.addEventListener('click', startNewGame);

        // 继续按钮
        UI.elements.nextTurn.addEventListener('click', nextTurn);

        // 玩家随时可以发送消息
        UI.elements.sendBtn.addEventListener('click', playerSend);
        UI.elements.playerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                playerSend();
            }
        });

        UI.elements.submitVote.addEventListener('click', submitVote);
    }

    // 开始新游戏
    async function startNewGame() {
        // 清除之前的计时器
        if (gameTimer) {
            clearTimeout(gameTimer);
            gameTimer = null;
        }
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        UI.clearChat();
        UI.showStartButton(false);

        const caseData = Cases.getRandom();
        Game.init(caseData);

        UI.showCaseInfo(caseData);
        UI.updateGameInfo(0, 25, 'discussion', 1);

        const victim = Characters.get(caseData.victim);
        UI.addSystemMessage(`各位魔法少女，${victim.name}已经离开了我们。现在，让我们开始魔女裁决，找出真凶。`);

        // 输入框始终显示
        UI.showPlayerInput(true);
        // 显示继续按钮
        UI.showNextButton(true);

        // 记录开始时间并启动计时器显示
        gameStartTime = Date.now();
        UI.updateTimer(GAME_TIME_LIMIT);
        
        // 每秒更新计时器显示
        timerInterval = setInterval(() => {
            const elapsed = Date.now() - gameStartTime;
            const remaining = GAME_TIME_LIMIT - elapsed;
            UI.updateTimer(remaining);
        }, 1000);

        // 设置30分钟计时器
        gameTimer = setTimeout(() => {
            if (Game.state.phase === 'discussion') {
                UI.addSystemMessage('⏰ 时间到！讨论时间已达30分钟，强制进入投票阶段。');
                startVoting();
            }
        }, GAME_TIME_LIMIT);
    }

    // 点击继续，进行下一轮
    async function nextTurn() {
        if (isProcessing) return;
        if (Game.state.phase !== 'discussion') return;

        isProcessing = true;
        UI.setButtonsEnabled(false);

        try {
            // 检查是否达到最大轮次
            if (Game.state.round >= Game.state.maxRounds) {
                await startVoting();
                return;
            }

            UI.showLoading(true);

            // 典狱长决策
            const decision = await Game.wardenDecide();
            console.log('典狱长决策:', decision);

            UI.showLoading(false);

            // 检查是否进入下一阶段
            if (decision.phaseChange) {
                if (Game.advanceCluePhase(decision.phaseChange)) {
                    UI.addSystemMessage(`💡 讨论前进了！新的线索浮出水面...`);
                    UI.updateGameInfo(Game.state.round, Game.state.maxRounds, 'discussion', Game.state.cluePhase);
                }
            }

            // 检查是否进入投票
            if (decision.startVoting) {
                await startVoting();
                return;
            }

            // AI角色发言
            if (decision.nextSpeaker) {
                let speakerId = decision.nextSpeaker;
                const char = Characters.get(speakerId);

                // 第一轮不能是希罗，如果选到了就换一个
                if (Game.state.round === 0 && speakerId === 'hiro') {
                    console.warn('第一轮不能是希罗，随机选择其他角色');
                    const aiChars = Characters.getAICharacters()
                        .filter(c => c.id !== Game.currentCase.victim && c.id !== 'hiro');
                    speakerId = aiChars[Math.floor(Math.random() * aiChars.length)].id;
                }

                if (!char) {
                    // 角色ID无效，随机选一个AI角色
                    console.warn('无效角色ID:', speakerId);
                    let aiChars = Characters.getAICharacters()
                        .filter(c => c.id !== Game.currentCase.victim);
                    // 第一轮排除希罗
                    if (Game.state.round === 0) {
                        aiChars = aiChars.filter(c => c.id !== 'hiro');
                    }
                    speakerId = aiChars[Math.floor(Math.random() * aiChars.length)].id;
                }

                const finalChar = Characters.get(speakerId);
                if (finalChar && !finalChar.isPlayer) {
                    UI.showLoading(true);
                    const response = await Game.characterSpeak(speakerId);
                    UI.showLoading(false);

                    Game.addMessage(speakerId, response);
                    UI.addMessage(speakerId, response);
                    UI.updateGameInfo(Game.state.round, Game.state.maxRounds, 'discussion', Game.state.cluePhase);
                } else if (finalChar && finalChar.isPlayer) {
                    // 典狱长点名玩家，提示玩家发言，禁用继续按钮
                    Game.state.waitingForPlayer = true;
                    UI.addSystemMessage('🎤 典狱长示意你发言，樱羽艾玛！');
                    UI.highlightInput(true);
                    UI.showNextButton(false);  // 隐藏继续按钮，必须发言
                }
            } else {
                // 没有返回下一位，随机选一个AI角色发言（排除希罗如果是第一轮）
                console.warn('典狱长未指定下一位发言者');
                let aiChars = Characters.getAICharacters()
                    .filter(c => c.id !== Game.currentCase.victim);
                
                // 第一轮排除希罗
                if (Game.state.round === 0) {
                    aiChars = aiChars.filter(c => c.id !== 'hiro');
                }
                
                const randomChar = aiChars[Math.floor(Math.random() * aiChars.length)];

                UI.showLoading(true);
                const response = await Game.characterSpeak(randomChar.id);
                UI.showLoading(false);

                Game.addMessage(randomChar.id, response);
                UI.addMessage(randomChar.id, response);
                UI.updateGameInfo(Game.state.round, Game.state.maxRounds, 'discussion', Game.state.cluePhase);
            }
        } catch (error) {
            UI.showLoading(false);
            console.error('nextTurn错误:', error);
            UI.addSystemMessage(`发生错误: ${error.message}`);
        } finally {
            isProcessing = false;
            UI.setButtonsEnabled(true);
        }
    }

    // 玩家随时插话
    async function playerSend() {
        const content = UI.elements.playerInput.value.trim();
        if (!content) return;
        if (Game.state.phase !== 'discussion') return;

        UI.elements.playerInput.value = '';
        // 取消高亮
        UI.highlightInput(false);

        // 直接加入对话历史
        Game.addMessage('emma', content);
        UI.addMessage('emma', content, 'player');
        UI.updateGameInfo(Game.state.round, Game.state.maxRounds, 'discussion');

        // 如果之前在等待玩家发言，恢复继续按钮
        if (Game.state.waitingForPlayer) {
            Game.state.waitingForPlayer = false;
            UI.showNextButton(true);
        }
    }

    // 开始投票阶段
    async function startVoting() {
        // 清除计时器
        if (gameTimer) {
            clearTimeout(gameTimer);
            gameTimer = null;
        }
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        UI.hideTimer();

        Game.state.phase = 'voting';
        UI.updateGameInfo(Game.state.round, Game.state.maxRounds, 'voting');
        UI.showNextButton(false);
        UI.addSystemMessage('讨论结束，现在开始魔女投票。');

        const votableChars = Characters.getAll()
            .filter(c => c.id !== Game.currentCase.victim);

        const aiChars = Characters.getAICharacters()
            .filter(c => c.id !== Game.currentCase.victim);

        // 显示投票面板（先显示，让玩家看到进度）
        UI.showPlayerInput(false);
        UI.showVotePanel(votableChars);

        for (const char of aiChars) {
            UI.showLoading(true);
            try {
                const vote = await Game.characterVote(char.id);
                
                // 如果投票目标无效，随机选一个
                if (!vote.target || !Characters.get(vote.target)) {
                    const validTargets = votableChars.filter(c => c.id !== char.id);
                    vote.target = validTargets[Math.floor(Math.random() * validTargets.length)].id;
                    vote.reason = vote.reason || '直觉';
                }
                
                Game.state.votes[char.id] = vote;
                const targetName = Characters.get(vote.target)?.name || vote.target;
                UI.addMessage(char.id, `投票给 ${targetName}：${vote.reason}`);
                
                // 更新投票进度
                UI.updateVoteProgress(Game.state.votes);
            } catch (error) {
                console.error(`${char.name} 投票失败:`, error);
                // 投票失败时随机投票
                const validTargets = votableChars.filter(c => c.id !== char.id);
                const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
                Game.state.votes[char.id] = { target: randomTarget.id, reason: '...' };
                UI.addMessage(char.id, `投票给 ${randomTarget.name}：...`);
                UI.updateVoteProgress(Game.state.votes);
            }
            UI.showLoading(false);
            await sleep(300);
        }

        // 等待玩家投票
        isProcessing = false;
        UI.setButtonsEnabled(true);
    }

    // 提交玩家投票
    async function submitVote() {
        const target = UI.getSelectedVote();
        if (!target) {
            alert('请选择一个投票对象');
            return;
        }

        const reason = prompt('请输入投票理由（可选）：') || '直觉';

        Game.state.votes['emma'] = { target, reason };
        UI.addMessage('emma', `投票给 ${Characters.get(target).name}：${reason}`, 'player');
        UI.hideVotePanel();

        showResult();
    }

    // 显示最终结果
    function showResult() {
        Game.state.phase = 'ended';
        UI.updateGameInfo(Game.state.round, Game.state.maxRounds, 'ended');

        const result = Game.getVoteResult();
        const culprit = Characters.get(Game.currentCase.culprit);
        const topSuspect = Characters.get(result.topSuspect);
        const victim = Characters.get(Game.currentCase.victim);
        const currentPhase = Game.state.cluePhase;

        // 投票统计
        let statsHtml = '📊 投票结果：<br>';
        for (const [charId, count] of Object.entries(result.counts)) {
            const char = Characters.get(charId);
            statsHtml += `${char.name}: ${count}票<br>`;
        }
        UI.addSystemMessage(statsHtml);

        // 判断结果
        if (result.isCorrect) {
            UI.addSystemMessage(`🎉 正义得到伸张！大家成功找出了真凶！`);
        } else {
            UI.addSystemMessage(`😢 真凶逃脱了...${topSuspect.name}被冤枉处刑了。`);
        }

        // 根据当前阶段展示不同内容
        if (currentPhase >= 3) {
            // 第三阶段：展示完整案件全貌（但不揭示凶手）
            let caseDetail = `<br>📋 <b>案件全貌</b><br>`;
            caseDetail += `受害者：${victim.name}<br>`;
            caseDetail += `地点：${Game.currentCase.location}<br>`;
            caseDetail += `时间：${Game.currentCase.time}<br><br>`;

            caseDetail += `<b>各角色持有的线索（完整版）：</b><br>`;
            for (const [charId, clue] of Object.entries(Game.currentCase.cluesPhase3)) {
                const char = Characters.get(charId);
                if (char) {
                    caseDetail += `【${char.name}】${clue}<br>`;
                }
            }
            UI.addSystemMessage(caseDetail);
        } else {
            // 第一或第二阶段：只展示当前阶段的线索
            const phaseNames = ['', '第一阶段', '第二阶段', '第三阶段'];
            const currentClues = Game.getCurrentClues();
            
            let partialInfo = `<br>📋 <b>当前掌握的线索（${phaseNames[currentPhase]}）</b><br>`;
            partialInfo += `受害者：${victim.name}<br>`;
            partialInfo += `地点：${Game.currentCase.location}<br>`;
            partialInfo += `时间：${Game.currentCase.time}<br><br>`;
            
            partialInfo += `<b>各角色已透露的线索：</b><br>`;
            for (const [charId, clue] of Object.entries(currentClues)) {
                const char = Characters.get(charId);
                if (char) {
                    partialInfo += `【${char.name}】${clue}<br>`;
                }
            }
            UI.addSystemMessage(partialInfo);
            
            UI.addSystemMessage(`<br>💡 <b>提示：</b>你还没有发现全部真相！讨论只进行到${phaseNames[currentPhase]}，还有更多线索等待挖掘。下次试试深入调查吧！`);
        }

        UI.showStartButton(true);
        UI.showNextButton(false);
    }

    // 工具函数
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    document.addEventListener('DOMContentLoaded', init);
})();
