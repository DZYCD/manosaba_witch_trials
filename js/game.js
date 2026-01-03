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
            waitingForPlayer: false,
            completedPlotPoints: {  // 记录每个阶段已完成的剧情点
                1: [],  // 第一阶段已完成的点
                2: [],  // 第二阶段已完成的点
                3: []   // 第三阶段已完成的点
            }
        };
    },

    // 获取当前阶段的线索
    getCurrentClues() {
        const phase = this.state.cluePhase;
        if (phase === 1) return this.currentCase.cluesPhase1;
        if (phase === 2) return this.currentCase.cluesPhase2;
        return this.currentCase.cluesPhase3;
    },

    // 检测是否有两人争论僵局（某人连续发言超过2轮）
    detectStalemate() {
        const history = this.state.history;
        if (history.length < 4) return null;
        
        // 检查最近6条消息中是否有人发言超过2次
        const recentMessages = history.slice(-6);
        const speakerCounts = {};
        for (const msg of recentMessages) {
            if (msg.speaker !== 'emma') { // 不算玩家
                speakerCounts[msg.speaker] = (speakerCounts[msg.speaker] || 0) + 1;
            }
        }
        
        // 找出发言超过2次的角色
        for (const [speaker, count] of Object.entries(speakerCounts)) {
            if (count > 2) {
                return speaker;
            }
        }
        return null;
    },

    // 获取打破僵局应该让谁发言
    getStalemateBreaker(stalemateSpeaker) {
        // 定义僵局打破者映射
        const breakerMap = {
            'hanna': 'sherii',   // 汉娜争论太多 → 让雪莉出来
            'coco': 'anan',      // 可可争论太多 → 让安安出来
            'hiro': 'millia',    // 希罗争论太多 → 让米莉亚出来
            'noah': 'arisa',     // 诺亚争论太多 → 让亚里沙出来
            'sherii': 'hanna',   // 雪莉争论太多 → 让汉娜出来
            'anan': 'nayeka',    // 安安争论太多 → 让奈叶香出来
            'millia': 'coco',    // 米莉亚争论太多 → 让可可出来
            'arisa': 'noah',     // 亚里沙争论太多 → 让诺亚出来
            'nayeka': 'anan'     // 奈叶香争论太多 → 让安安出来
        };
        return breakerMap[stalemateSpeaker] || null;
    },

    // 获取故事讲述人系统提示词（负责推进剧情发展）
    getHostPrompt() {
        const charList = Characters.getAll()
            .filter(c => c.id !== this.currentCase.victim)
            .map(c => `- ${c.id}（${c.name}）`)
            .join('\n');

        // 获取当前阶段每个角色知道的线索
        const currentClues = this.getCurrentClues();
        let cluesSummary = '\n【各角色掌握的信息】\n';
        for (const [charId, clue] of Object.entries(currentClues)) {
            const char = Characters.get(charId);
            if (char) {
                // 去掉括号内的隐藏指示，保留完整内容
                const simplifiedClue = clue.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
                cluesSummary += `- ${char.name}：${simplifiedClue}\n`;
            }
        }

        // 检测僵局
        const stalemateSpeaker = this.detectStalemate();
        let stalemateHint = '';
        if (stalemateSpeaker) {
            const breaker = this.getStalemateBreaker(stalemateSpeaker);
            const stalemateChar = Characters.get(stalemateSpeaker);
            const breakerChar = breaker ? Characters.get(breaker) : null;
            if (breakerChar) {
                stalemateHint = `\n【打破僵局】${stalemateChar?.name || stalemateSpeaker}发言太多了，故事陷入僵局！
你必须让 ${breakerChar.name}（${breaker}）发言来推进故事！`;
                console.log(`[故事讲述人] 检测到僵局：${stalemateChar?.name} 发言过多，建议让 ${breakerChar.name} 发言`);
            }
        }

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
- 如果艾玛问了某个问题，根据上面的【各角色掌握的信息】，让最可能知道答案的角色回答
- 如果艾玛质疑某人，让那个人辩护
- 艾玛的意愿是最重要的，必须尊重！`;
        }

        // 检查玩家最近是否发言，提取玩家关注点
        const playerMessages = this.state.history.filter(h => h.speaker === 'emma');
        const lastPlayerMessage = playerMessages.length > 0 ? playerMessages[playerMessages.length - 1].content : null;
        const playerFocusHint = (!isEmmaLastSpeaker && lastPlayerMessage)
            ? `\n【玩家关注点】樱羽艾玛之前说过："${lastPlayerMessage}"\n可以不忙管剧情，先参考玩家的思路。` 
            : '';

        // 第一轮不能选希罗
        const firstRoundHint = this.state.round === 0
            ? '\n【特别注意】这是第一轮发言，不能选择hiro（二阶堂希罗）作为第一个发言者！'
            : '';

        return `你是"魔女裁决"的故事讲述人，负责推进这个推理故事的发展。

【你的职责】
1. 你是这个故事的讲述者，你应该参考用户给的剧本，确定当前剧情到达了哪一点，你又要运行哪一个剧情
2. 尊重玩家（樱羽艾玛）的推理方向，她是故事的主角
3. 引导故事朝着真相的方向发展，让关键线索逐步浮出水面

【登场角色】
${charList}
${stalemateHint}
${emmaDirectionHint}

【讲述规则】
- 绝对不能让同一个角色连续发言两轮！
- 如果有【打破僵局】提示，必须优先让指定角色发言！
- 如果玩家（艾玛）刚发言，必须优先响应她的要求
- 如果玩家提问了某人，让那个人回答
- 如果玩家质疑某人，让那个人辩护
- 如果故事没有进展，选择能推进剧情的角色，让他们说出关键信息
${lastSpeakerHint}
${playerFocusHint}
${firstRoundHint}

【进入投票的条件】
- 已达到35轮讨论
- 玩家明确表示要投票


【输出格式】
先分析目前的剧情，确定当前剧情到达了哪一个点，然后输出：
【下一位】角色ID
【话题】你希望这个角色谈论的内容（一句话）

或者：
【进入投票】

`;
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

【你的内心】
${task}

【发言要求】
1. 用口语化、符合你性格的方式说话
2. 不要主动透露所有线索！只有被直接问到时才说
3. 可以说一些无关紧要的话，或者表达自己的情绪
4. 如果你是嫌疑人，要为自己辩护
5. 回复控制在30-80字，像真人聊天一样
6. 可以质疑别人，把嫌疑引向其他人`;
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

【你的重要信息】
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

    // 获取剧情进度判官系统提示词（负责判断进度和阶段转换）
    getProgressJudgePrompt() {
        const currentPhase = this.state.cluePhase;
        const completedPoints = this.state.completedPlotPoints[currentPhase] || [];
        
        // 定义每个阶段的所有剧情点
        let allPlotPoints = [];
        
        if (currentPhase === 1) {
            allPlotPoints = [
                { id: 1, speaker: 'millia', content: '米莉亚 说"希罗和蕾雅吵架"' },
                { id: 2, speaker: 'hiro', content: '希罗 说"不在场证明"或"和艾玛在淋浴室"' },
                { id: 3, speaker: 'emma', content: '艾玛 为希罗辩护（玩家发言）' },
                { id: 4, speaker: 'marg', content: '玛格 询问亚里莎的"不在场证明"' },
                { id: 5, speaker: 'arisa', content: '亚里莎 说"在外面"或"不在场"' },
                { id: 6, speaker: 'sherii', content: '雪莉 说"汉娜去找蕾雅"或"汉娜去钟楼" ← 【阶段转换点】' }
            ];
        } else if (currentPhase === 2) {
            allPlotPoints = [
                { id: 1, speaker: 'marg', content: '玛格 说"汉娜有作案动机"' },
                { id: 2, speaker: 'nayeka', content: '奈叶香 说"血蝴蝶"或"头顶有血洞"或"脸上有裂痕"' },
                { id: 3, speaker: 'meruru', content: '梅露露 说"魔女化"或"救不回来"' },
                { id: 4, speaker: 'arisa', content: '亚里沙 说"药水"和"杀死魔女" ← 【阶段转换点】' }
            ];
        } else {
            allPlotPoints = [
                { id: 1, speaker: 'coco', content: '可可 否认"丢药"或"不承认"' },
                { id: 2, speaker: 'anan', content: '安安 说"药丢在画室"' },
                { id: 3, speaker: 'marg', content: '玛格 询问诺亚当时在做什么' },
                { id: 4, speaker: 'hiro', content: '希罗 说"画室能看到钟楼"' },
                { id: 5, speaker: 'marg', content: '玛格 说"垃圾滑槽"或"相连"' },
                { id: 6, speaker: 'noah', content: '诺亚 说"魔女化"或"保护汉娜"或承认' }
            ];
        }

        // 构建剧情点列表文本（全部显示，标记已完成的）
        let plotPointsText = '【剧情点列表】\n';
        for (const point of allPlotPoints) {
            const isCompleted = completedPoints.includes(point.id);
            const status = isCompleted ? '✓已完成' : '○待完成';
            plotPointsText += `${point.id}. [${status}] [${point.speaker}] ${point.content}\n`;
        }

        // 找到第一个未完成的点
        const firstIncomplete = allPlotPoints.find(p => !completedPoints.includes(p.id));
        const checkTarget = firstIncomplete 
            ? `请重点检查第${firstIncomplete.id}条是否已完成。` 
            : '所有剧情点已完成。';

        return `你是"魔女裁决"的剧情进度判官，负责按顺序检查剧情点是否完成。

【判定规则】
- 必须是【指定的角色】说出了【相关的内容】才算完成
- 内容匹配要灵活，意思相近即可，不要太死板
- 例如：要求"米莉亚说希罗和蕾雅吵架"，如果是希罗自己说的，不算完成

【当前阶段】第${currentPhase}阶段

${plotPointsText}

【你的任务】
按顺序检查剧情点：
1. 从第一个"○待完成"的点开始检查
2. 如果对话中已经有对应角色说了相关内容 → 标记为完成，继续检查下一个
3. 如果对话中没有 → 这就是【下一步】要推进的剧情点，停止检查

${checkTarget}

【输出格式】
【分析】逐条分析待完成的剧情点（从编号最小的开始），说明是否在对话中找到了对应内容
【新完成】编号（多个用逗号分隔，没有就写"无"）
【下一步】编号. 具体内容（第一个未完成的剧情点）
【发言人】角色ID`;
    },

    // 剧情进度判官决策（同时负责进度判断和阶段转换）
    async progressJudgeDecide() {
        const systemPrompt = this.getProgressJudgePrompt();
        const prompt = `【对话记录】
${this.formatHistory() || '（讨论刚开始）'}

请分析当前剧情进度，告诉我下一步应该发生什么，以及是否需要进入下一阶段。`;

        console.log('[剧情进度判官] 系统提示词:', systemPrompt);
        console.log('[剧情进度判官] 用户提示词:', prompt);

        const response = await API.chat(systemPrompt, prompt);
        return this.parseProgressJudgeResponse(response);
    },

    // 解析剧情进度判官回复
    parseProgressJudgeResponse(text) {
        console.log('[剧情进度判官] 原始回复:', text);
        
        const result = {
            completed: [],
            nextStep: null,
            nextSpeaker: null,
            phaseChange: null
        };

        const currentPhase = this.state.cluePhase;

        // 解析新完成的剧情点（只添加，不删除已完成的）
        const newCompletedMatch = text.match(/【新完成】(.+?)(?=【|$)/s);
        if (newCompletedMatch) {
            const newCompletedStr = newCompletedMatch[1].trim();
            if (newCompletedStr !== '无' && newCompletedStr !== '') {
                // 提取数字
                const numbers = newCompletedStr.match(/\d+/g);
                if (numbers) {
                    for (const num of numbers) {
                        const pointId = parseInt(num);
                        // 只添加不存在的点（去重）
                        if (!this.state.completedPlotPoints[currentPhase].includes(pointId)) {
                            this.state.completedPlotPoints[currentPhase].push(pointId);
                            console.log(`[剧情进度判官] ✓ 新完成剧情点：阶段${currentPhase} 第${pointId}点`);
                        }
                    }
                    // 排序，保持顺序
                    this.state.completedPlotPoints[currentPhase].sort((a, b) => a - b);
                }
            }
        }

        // 当前阶段已完成的所有点（已完成的永远保持完成状态）
        result.completed = [...this.state.completedPlotPoints[currentPhase]];

        // 解析下一步
        const nextStepMatch = text.match(/【下一步】(.+?)(?=【|$)/s);
        if (nextStepMatch) {
            result.nextStep = nextStepMatch[1].trim();
        }

        // 解析发言人
        const speakerMatch = text.match(/【发言人】(\w+)/);
        if (speakerMatch) {
            result.nextSpeaker = speakerMatch[1];
        }

        // 自动判断阶段转换（不依赖剧情判官输出）
        // 检查当前阶段是否所有剧情点都完成了
        const phaseMaxPoints = { 1: 6, 2: 4, 3: 7 };  // 每个阶段的剧情点数量
        const completedCount = this.state.completedPlotPoints[currentPhase].length;
        const maxPoints = phaseMaxPoints[currentPhase];
        
        if (completedCount >= maxPoints && currentPhase < 3) {
            // 当前阶段所有剧情点都完成了，自动切换到下一阶段
            result.phaseChange = currentPhase + 1;
            console.log(`[剧情进度判官] ✓ 阶段${currentPhase}所有${maxPoints}个剧情点已完成，自动进入第${currentPhase + 1}阶段`);
        }

        console.log('[剧情进度判官] 解析结果:', result);
        console.log('[剧情进度判官] 当前阶段已完成的剧情点:', this.state.completedPlotPoints);
        return result;
    },

    // 故事讲述人决策（选择下一位发言者）
    async hostDecide() {
        // 让剧情进度判官判断当前进度和阶段转换
        const progressInfo = await this.progressJudgeDecide();
        
        const systemPrompt = this.getHostPrompt();
        const currentPhase = this.state.cluePhase;
        
        // 构建剧情指引 - 只告诉故事讲述人下一步应该做什么
        let plotGuide = '';
        if (progressInfo.nextStep) {
            plotGuide = `
【下一步剧情】
${progressInfo.nextStep}
建议发言人：${progressInfo.nextSpeaker || '待定'}`;
        } else {
            plotGuide = `【当前阶段】第${currentPhase}阶段
剧情进度判官未能确定下一步，请根据对话内容自行判断。`;
        }

        const prompt = `【案件信息】
受害者：${Characters.get(this.currentCase.victim).name}
地点：${this.currentCase.location}
时间：${this.currentCase.time}

【当前轮次】${this.state.round}/${this.state.maxRounds}
【当前阶段】第${currentPhase}阶段

【对话记录】
${this.formatHistory() || '（讨论刚开始）'}

${plotGuide}

请根据上面的剧情指引，决定下一位发言者和话题。
如果玩家（艾玛）刚发言，优先响应她的要求。

否则，按照【下一步剧情】的指引明确要求${progressInfo.nextStep}。`;

        console.log('[故事讲述人] 系统提示词:', systemPrompt);
        console.log('[故事讲述人] 用户提示词:', prompt);

        const response = await API.chat(systemPrompt, prompt);
        
        // 把阶段转换信息附加到结果中
        const hostResult = this.parseHostResponse(response);
        hostResult.phaseChange = progressInfo.phaseChange;
        
        return hostResult;
    },

    // 解析故事讲述人回复
    parseHostResponse(text) {
        console.log('[故事讲述人] 原始回复:', text);
        
        const result = {
            summary: text.replace(/【[^】]+】.*/g, '').trim(),
            nextSpeaker: null,
            topic: null,
            startVoting: false
        };

        if (text.includes('【进入投票】')) {
            result.startVoting = true;
        }

        // 尝试匹配【下一位】格式
        const match = text.match(/【下一位】(\w+)/);
        if (match) {
            result.nextSpeaker = match[1];
        }

        // 尝试匹配【话题】格式
        const topicMatch = text.match(/【话题】(.+?)(?=【|$)/s);
        if (topicMatch) {
            result.topic = topicMatch[1].trim();
        }
        
        // 如果没有匹配到角色，尝试从文本中提取角色名
        if (!result.nextSpeaker) {
            const allChars = Characters.getAll().filter(c => c.id !== this.currentCase?.victim);
            
            // 先尝试匹配角色ID
            for (const char of allChars) {
                if (text.toLowerCase().includes(char.id)) {
                    result.nextSpeaker = char.id;
                    console.log('[故事讲述人] 从文本中提取到角色ID:', char.id);
                    break;
                }
            }
            
            // 如果还没找到，尝试匹配角色名字
            if (!result.nextSpeaker) {
                for (const char of allChars) {
                    if (text.includes(char.name)) {
                        result.nextSpeaker = char.id;
                        console.log('[故事讲述人] 从文本中提取到角色名:', char.name, '-> ID:', char.id);
                        break;
                    }
                }
            }
        }

        console.log('[故事讲述人] 解析结果:', result);
        return result;
    },

    // 典狱长决策（现在只调用故事讲述人，阶段转换由剧情进度判官一并处理）
    async wardenDecide() {
        // 故事讲述人决策（内部会调用剧情进度判官）
        const hostDecision = await this.hostDecide();
        
        return {
            summary: hostDecision.summary,
            nextSpeaker: hostDecision.nextSpeaker,
            topic: hostDecision.topic,
            startVoting: hostDecision.startVoting,
            phaseChange: hostDecision.phaseChange
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
            // 进入下一阶段，轮次上限+15
            this.state.maxRounds += 5;
            console.log(`[阶段转换] 进入第${newPhase}阶段，轮次上限增加到 ${this.state.maxRounds}`);
            return true;
        }
        return false;
    },

    // 角色发言
    async characterSpeak(charId, topic = null) {
        const char = Characters.get(charId);
        const systemPrompt = this.getCharacterSystemPrompt(charId);
        
        // 误导性线索 - 只给AI看
        const misleadingInfo = this.currentCase.misleadingInfo 
            ? `\n【背景信息】${this.currentCase.misleadingInfo}` 
            : '';

        // 话题提示
        const topicHint = topic 
            ? `\n\n现在轮到你发言。你发言中必须要“明确”带有这个关键词：${topic}。` 
            : '';

        const prompt = `【案件背景】
受害者：${Characters.get(this.currentCase.victim).name}
${this.currentCase.publicInfo}${misleadingInfo}

【当前讨论阶段】第${this.state.cluePhase}阶段

【对话记录】
${this.formatHistory()}

现在轮到你发言了。${topicHint}`;

        console.log(`[角色:${char?.name || charId}] 系统提示词:`, systemPrompt);
        console.log(`[角色:${char?.name || charId}] 用户提示词:`, prompt);

        return await API.chat(systemPrompt, prompt);
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
        for (const [, data] of Object.entries(this.state.votes)) {
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
