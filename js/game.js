// 游戏核心逻辑
const Game = {
    state: null,
    currentCase: null,
    isProcessing: false,

    // 初始化新游戏
    init(caseData) {
        this.currentCase = caseData;
        this.state = {
            round: 0,
            maxRounds: 25,
            phase: 'discussion', // discussion, voting, ended
            cluePhase: 1,  // 线索阶段：1, 2, 3
            history: [],
            votes: {},
            waitingForPlayer: false
        };
    },

    // 获取当前阶段的线索
    getCurrentClues() {
        const phase = this.state.cluePhase;
        if (phase === 1) return this.currentCase.cluesPhase1;
        if (phase === 2) return this.currentCase.cluesPhase2;
        return this.currentCase.cluesPhase3;
    },

    // 获取剧情判官系统提示词（知道全部真相，负责判断阶段转换）
    getStoryJudgePrompt() {
        const fullTruth = this.currentCase.fullTruth || '';
        const currentPhase = this.state.cluePhase;

        return `你是"魔女裁决"的剧情判官，负责判断讨论是否应该进入下一阶段。

【你掌握的案件全貌】
${fullTruth}

【当前线索阶段】第${currentPhase}阶段

【阶段转换条件】

第1阶段→第2阶段：
只要对话中有人提到"汉娜去了钟楼"就立即转阶段！
- 不管是谁说的都算

第2阶段→第3阶段：
只要亚里沙（arisa）说出"只有药水能杀死魔女"或类似内容，就转阶段！

【输出格式】
只输出以下之一：
【保持当前阶段】
【进入第二阶段】
【进入第三阶段】`;
    },

    // 获取主持人系统提示词（不知道真相，只负责选人发言）
    getHostPrompt() {
        const charList = Characters.getAll()
            .filter(c => c.id !== this.currentCase.victim)
            .map(c => `- ${c.id}（${c.name}）`)
            .join('\n');

        // 获取上一位发言者
        const lastSpeaker = this.state.history.length > 0 
            ? this.state.history[this.state.history.length - 1].speaker 
            : null;
        const lastSpeakerHint = lastSpeaker 
            ? `\n【重要】上一位发言者是 ${lastSpeaker}，你必须选择其他人发言，不能连续让同一人发言！` 
            : '';

        // 检查最后发言的是否是艾玛
        const lastMessage = this.state.history.length > 0 
            ? this.state.history[this.state.history.length - 1] 
            : null;
        const isEmmaLastSpeaker = lastMessage && lastMessage.speaker === 'emma';
        
        // 如果艾玛刚发言，强调要响应她的要求
        let emmaDirectionHint = '';
        if (isEmmaLastSpeaker) {
            emmaDirectionHint = `\n【最高优先级】艾玛刚刚发言了："${lastMessage.content}"
你必须分析艾玛的发言，判断她想让谁回答：
- 如果艾玛提到了某个角色的名字或ID，让那个角色发言
- 如果艾玛问了某个问题，让最可能知道答案的角色回答
- 如果艾玛质疑某人，让那个人辩护
- 艾玛的意愿是最重要的，必须尊重！`;
        }

        // 检查玩家最近是否发言，提取玩家关注点
        const playerMessages = this.state.history.filter(h => h.speaker === 'emma');
        const lastPlayerMessage = playerMessages.length > 0 ? playerMessages[playerMessages.length - 1].content : null;
        const playerFocusHint = (!isEmmaLastSpeaker && lastPlayerMessage)
            ? `\n【玩家关注点】樱羽艾玛之前说过："${lastPlayerMessage}"\n可以参考玩家的思路。` 
            : '';

        // 第一轮不能选希罗
        const firstRoundHint = this.state.round === 0
            ? '\n【特别注意】这是第一轮发言，不能选择hiro（二阶堂希罗）作为第一个发言者！'
            : '';

        return `你是"魔女裁决"的主持人，负责决定下一位发言者。

【你的职责】
1. 根据对话内容选择合适的下一位发言者
2. 尊重玩家（樱羽艾玛）的推理方向
3. 玩家问什么，就让相关角色回答
4. 保持讨论的自然流动

【参与者】
${charList}
${emmaDirectionHint}

【发言规则】
- 绝对不能让同一个角色连续发言两轮！
- 如果玩家（艾玛）刚发言，必须优先响应她的要求
- 如果玩家提问了某人，让那个人回答
- 如果玩家质疑某人，让那个人辩护
- 如果没有明确方向，可以随机选择
${lastSpeakerHint}
${playerFocusHint}
${firstRoundHint}

【进入投票的条件】
- 已达到25轮讨论
- 玩家明确表示要投票

【输出格式】
简短总结（1句话），然后：
【下一位】角色ID

或者：
【进入投票】

示例：
"希罗需要解释一下。"
【下一位】hiro`;
    },

    // 获取角色系统提示词
    getCharacterSystemPrompt(charId) {
        const char = Characters.get(charId);
        const clues = this.getCurrentClues();
        const clue = clues[charId] || '你没有特别的线索。';
        const task = this.currentCase.hiddenTasks[charId] || '尽力找出真凶。';
        const currentPhase = this.state.cluePhase;

        return `你是${char.name}，一位魔法少女，正在参与魔女裁决的讨论。

【你的性格】
${char.personality}

【你的说话风格】
${char.speakStyle}

【当前讨论阶段】第${currentPhase}阶段

【你知道的线索】
${clue}

【你的隐藏任务】（绝对不能让别人知道这是你的任务）
${task}

【发言要求】
1. 用口语化、符合你性格的方式说话
2. 不要主动透露所有线索！只有被直接问到时才说
3. 可以说一些无关紧要的话，或者表达自己的情绪
4. 如果你是嫌疑人，要为自己辩护
5. 如果你有秘密（比如可可丢了药水），要尽量隐瞒，除非被逼问
6. 回复控制在30-80字，像真人聊天一样
7. 可以质疑别人，把嫌疑引向其他人`;
    },

    // 获取投票系统提示词
    getVoteSystemPrompt(charId) {
        const char = Characters.get(charId);
        const task = this.currentCase.hiddenTasks[charId] || '找出真凶。';
        
        // 列出可投票的角色
        const votableChars = Characters.getAll()
            .filter(c => c.id !== this.currentCase.victim && c.id !== charId)
            .map(c => `${c.id}（${c.name}）`)
            .join('、');

        return `你是${char.name}，讨论已经结束，现在要进行魔女投票。

【你的隐藏任务】
${task}

【可投票的角色】
${votableChars}

【投票要求】
根据讨论内容和你的任务，投出你认为是凶手的一票。
必须从上面的角色中选择一个投票！
不能投给受害者，不能投给自己。

【输出格式】严格按照以下格式输出：
【投票】角色ID
【理由】一句话理由

例如：
【投票】hanna
【理由】她的不在场证明有漏洞`;
    },

    // 格式化对话历史
    formatHistory() {
        return this.state.history
            .map(h => `【${Characters.get(h.speaker)?.name || h.speaker}】${h.content}`)
            .join('\n');
    },

    // 剧情判官决策（判断是否切换阶段）
    async storyJudgeDecide() {
        const prompt = `【当前轮次】${this.state.round}/${this.state.maxRounds}
【当前线索阶段】第${this.state.cluePhase}阶段

【对话记录】
${this.formatHistory() || '（讨论刚开始）'}

请判断是否应该进入下一阶段。`;

        const response = await API.chat(this.getStoryJudgePrompt(), prompt);
        return this.parseStoryJudgeResponse(response);
    },

    // 解析剧情判官回复
    parseStoryJudgeResponse(text) {
        if (text.includes('【进入第二阶段】')) {
            // 检查：只要有人说过汉娜去钟楼的事就行
            const allMessages = this.state.history;
            const someoneSaidIt = allMessages.some(m => 
                (m.content.includes('汉娜') && (m.content.includes('钟楼') || m.content.includes('上楼') || m.content.includes('找蕾雅')))
            );
            if (!someoneSaidIt) {
                console.warn('阶段转换被阻止：还没有人说出汉娜去钟楼的事');
                return null;
            }
            return 2;
        } else if (text.includes('【进入第三阶段】')) {
            // 检查：确保亚里沙说过药水的事
            const arisaMessages = this.state.history.filter(h => h.speaker === 'arisa');
            const arisaSaidIt = arisaMessages.some(m => 
                m.content.includes('药水') || (m.content.includes('药') && m.content.includes('杀'))
            );
            if (!arisaSaidIt) {
                console.warn('阶段转换被阻止：亚里沙还没说出药水的事');
                return null;
            }
            return 3;
        }
        return null;
    },

    // 主持人决策（选择下一位发言者）
    async hostDecide() {
        const prompt = `【案件信息】
受害者：${Characters.get(this.currentCase.victim).name}
地点：${this.currentCase.location}
时间：${this.currentCase.time}

【当前轮次】${this.state.round}/${this.state.maxRounds}

【对话记录】
${this.formatHistory() || '（讨论刚开始）'}

请决定下一位发言者。`;

        const response = await API.chat(this.getHostPrompt(), prompt);
        return this.parseHostResponse(response);
    },

    // 解析主持人回复
    parseHostResponse(text) {
        const result = {
            summary: text.replace(/【[^】]+】.*/g, '').trim(),
            nextSpeaker: null,
            startVoting: false
        };

        if (text.includes('【进入投票】')) {
            result.startVoting = true;
        }

        const match = text.match(/【下一位】(\w+)/);
        if (match) {
            result.nextSpeaker = match[1];
        }

        return result;
    },

    // 典狱长决策（组合两个判断）
    async wardenDecide() {
        // 先让剧情判官判断是否切换阶段
        const phaseChange = await this.storyJudgeDecide();
        
        // 再让主持人选择下一位发言者
        const hostDecision = await this.hostDecide();
        
        return {
            summary: hostDecision.summary,
            nextSpeaker: hostDecision.nextSpeaker,
            startVoting: hostDecision.startVoting,
            phaseChange: phaseChange
        };
    },

    // 解析典狱长回复（保留兼容性）
    parseWardenResponse(text) {
        const result = {
            summary: text.replace(/【[^】]+】.*/g, '').trim(),
            nextSpeaker: null,
            startVoting: false,
            phaseChange: null
        };

        // 检查阶段转换
        if (text.includes('【进入第二阶段】')) {
            result.phaseChange = 2;
        } else if (text.includes('【进入第三阶段】')) {
            result.phaseChange = 3;
        }

        if (text.includes('【进入投票】')) {
            result.startVoting = true;
        }

        const match = text.match(/【下一位】(\w+)/);
        if (match) {
            result.nextSpeaker = match[1];
        }

        return result;
    },

    // 更新线索阶段
    advanceCluePhase(newPhase) {
        if (newPhase > this.state.cluePhase && newPhase <= 3) {
            this.state.cluePhase = newPhase;
            return true;
        }
        return false;
    },

    // 角色发言
    async characterSpeak(charId) {
        // 误导性线索 - 只给AI看
        const misleadingInfo = this.currentCase.misleadingInfo 
            ? `\n【背景信息】${this.currentCase.misleadingInfo}` 
            : '';

        const prompt = `【案件背景】
受害者：${Characters.get(this.currentCase.victim).name}
${this.currentCase.publicInfo}${misleadingInfo}

【当前讨论阶段】第${this.state.cluePhase}阶段

【对话记录】
${this.formatHistory()}

现在轮到你发言了。`;

        return await API.chat(this.getCharacterSystemPrompt(charId), prompt);
    },

    // 角色投票
    async characterVote(charId) {
        const prompt = `【对话记录摘要】
${this.formatHistory()}

请投出你的一票。`;

        const response = await API.chat(this.getVoteSystemPrompt(charId), prompt);
        return this.parseVoteResponse(response);
    },

    // 解析投票回复
    parseVoteResponse(text) {
        const result = { target: null, reason: '' };
        
        // 尝试多种匹配方式
        let targetMatch = text.match(/【投票】\s*(\w+)/);
        if (!targetMatch) {
            targetMatch = text.match(/投票[：:]\s*(\w+)/);
        }
        if (!targetMatch) {
            // 尝试匹配角色名
            const allChars = Characters.getAll();
            for (const char of allChars) {
                if (text.includes(char.name) && char.id !== this.currentCase?.victim) {
                    result.target = char.id;
                    break;
                }
            }
        } else {
            result.target = targetMatch[1];
        }

        // 验证target是否有效
        if (result.target && !Characters.get(result.target)) {
            // 尝试通过名字找ID
            const allChars = Characters.getAll();
            for (const char of allChars) {
                if (char.name.includes(result.target) || result.target.includes(char.name)) {
                    result.target = char.id;
                    break;
                }
            }
        }

        const reasonMatch = text.match(/【理由】(.+)/);
        if (reasonMatch) {
            result.reason = reasonMatch[1].trim();
        } else {
            // 如果没有理由标签，取第一句话作为理由
            const sentences = text.split(/[。！？\n]/);
            result.reason = sentences[0]?.trim() || '直觉';
        }

        return result;
    },

    // 添加消息到历史
    addMessage(speaker, content) {
        this.state.history.push({ speaker, content, time: Date.now() });
        this.state.round++;
    },

    // 统计投票结果
    countVotes() {
        const counts = {};
        for (const [voter, data] of Object.entries(this.state.votes)) {
            const target = data.target;
            counts[target] = (counts[target] || 0) + 1;
        }
        return counts;
    },

    // 获取投票结果
    getVoteResult() {
        const counts = this.countVotes();
        const maxVotes = Math.max(...Object.values(counts));
        const suspects = Object.keys(counts).filter(k => counts[k] === maxVotes);
        
        return {
            counts,
            topSuspect: suspects[0],
            isTie: suspects.length > 1,
            isCorrect: suspects.includes(this.currentCase.culprit)
        };
    }
};
