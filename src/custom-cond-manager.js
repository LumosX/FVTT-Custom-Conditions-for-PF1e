let socket;
const showUIMessage = "showUIMessage";

export function InitCustomCondManager(socketInstance) {
    socket = socketInstance;

    // Perform pre-init
    preInit_CleanExistingHooks();

    Hooks.on("renderChatMessageHTML", (...args) => onRenderCustomCondChatMessage_AddOnClickTokenPanning(...args));
    Hooks.on("pf1ToggleActorBuff", (...args) => onToggleActorBuff_DeleteEmbeddedItemWhenCustomCondDisabled(...args));

    game.customConditions = game.customConditions || {};

    const bindGMFunc = (name, binding) => {
        socket.register(name, binding);
        return async (...args) => {
            return await socket.executeAsGM(name, ...args);
        };
    }

    game.customConditions.apply = bindGMFunc("applyCond", apply);
    game.customConditions.remove = bindGMFunc("removeCond", remove);
    socket.register(showUIMessage, (message, _) => ui.notifications.warn(message));

    game.customConditions.hook = Hooks.on("createActiveEffect", onCreateActiveEffect_HandleInitiativeEndDurations);

    console.log("Lumos's Custom Condition Manager | SUCCESSFULLY initialised");
}

async function trigger(userId, parameters, isCreating) {
    if (!checkRunningAsGM(userId)) return;

    const targets = getUserTargets(userId);
    if (!targets) return;

    if (parameters.isStatus)
        await (isCreating ? applyStatusEffect : removeStatusEffect)(userId, parameters, targets);
    else
        await (isCreating ? applyCustomCondition : removeCustomCondition)(userId, parameters, targets);
}

const apply = async (userId, parameters) => await trigger(userId, parameters, true);
const remove = async (userId, parameters) => await trigger(userId, parameters, false);

function preInit_CleanExistingHooks() {
    // Init hook we need to handle special AE durations
    if (game.customConditions?.hook)
        Hooks.off("createActiveEffect", game.customConditions.hook)
}

async function onCreateActiveEffect_HandleInitiativeEndDurations(newEffect, options, userId) {
    if (userId !== game.user.id) return;

    const initEndEffectTargetInit = newEffect.flags?.lumos?.initiativeEnd ?? newEffect.parent.flags?.lumos?.initiativeEnd;
    if (!initEndEffectTargetInit) return;

    console.log("create hook triggered", newEffect, initEndEffectTargetInit);
    newEffect.update(getEffectUpdatesForInitEndEffect(initEndEffectTargetInit));
}

async function onRenderCustomCondChatMessage_AddOnClickTokenPanning(message, html) {
    // Add click event listener to links printed in customCond messages
    if (!message.flags?.customConditionsMessage)
        return;

    html.querySelectorAll(".focus-token").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            const tokenId = event.currentTarget.dataset.tokenId;
            const token = canvas.tokens.get(tokenId);
            if (token) {
                canvas.animatePan({ x: token.x, y: token.y });
            }
        });
    });
}

async function onToggleActorBuff_DeleteEmbeddedItemWhenCustomCondDisabled(actor, item, state) {
    if (!item.flags.lumos?.customConditionBuff || state) // on disable
        return;

    await Item.implementation.deleteDocuments([item.id], {parent: actor});
}

function getInitiativeForInitEndEffect() {
    return game.combat.turns[game.combat.turn].initiative - 0.001;
}

function getEffectUpdatesForInitEndEffect(targetInitiative) {
    return {
        "flags.pf1.duration.end": "initiative",
        "flags.pf1.duration.initiative": targetInitiative,
        "flags.pf1.initiative": targetInitiative,
        "system.initiative": targetInitiative
    }
}

const AffectedToken = {
    ConditionAdded: 0,
    ConditionIncreased: 1,
    ConditionRemoved: 2,
    ConditionDecreased: 3,
}

async function applyCustomCondition(userId, parameters, targets) {
    const { conditionId, _, increaseLevel, setDuration } = parameters;

    const [cond, condIdentifier] = getCustomConditionItem(conditionId);

    // On actors who don't have this condition yet, we'll add a new item.
    const newCondToAdd = createCustomConditionItem(cond, condIdentifier, setDuration);
    let affectedTokens = [];
    for (let token of targets) {
        const actorCond = getCustomBuffOnActor(token.actor, condIdentifier);

        if (actorCond && !increaseLevel.active && !setDuration.active) continue;

        if (!actorCond) {
            token.actor.createEmbeddedDocuments("Item", [newCondToAdd]);
            affectedTokens.push({ token: token, state: AffectedToken.ConditionAdded })
        }
        else {
            const updates = {}
            if (increaseLevel.active) {
                updates["system.level"] = parseInt(actorCond.system.level, 10) + increaseLevel.value;
            }
            if (setDuration.active) {
                updates["system.duration"] = newCondToAdd.system.duration;

                const updateInitEnd = game.combat && setDuration.end === "initiativeEnd";
                const targetInit = newCondToAdd.flags.lumos?.initiativeEnd;

                if (updateInitEnd)
                    updates["flags.lumos.initiativeEnd"] = targetInit;

                const effectUpdates = {
                    duration: createStatusEffectDuration(setDuration),
                    ...(updateInitEnd && getEffectUpdatesForInitEndEffect(targetInit))
                };
                actorCond.effect.update(effectUpdates);
            }
            actorCond.update(updates);
            affectedTokens.push({ token: token, state: AffectedToken.ConditionIncreased })
        }
    }

    renderChatMessage(userId, cond.name, cond.img, false, true, affectedTokens);
}

async function removeCustomCondition(userId, parameters, targets) {
    const { conditionId, _, decreaseLevel } = parameters;

    const [cond, condIdentifier] = getCustomConditionItem(conditionId);

    let affectedTokens = [];
    for (let token of targets) {
        const actorCond = getCustomBuffOnActor(token.actor, condIdentifier);
        if (!actorCond) continue;

        // If the current level is greater than zero but won't be removed by the decrease, do it
        const levelDecrease = parseInt(actorCond.system.level, 10) - decreaseLevel.value;
        if (decreaseLevel.active && actorCond.system.level > 0 && levelDecrease > 0) {
            actorCond.update({ "system.level": levelDecrease });
            affectedTokens.push({ token: token, state: AffectedToken.ConditionDecreased })
        }
        // Otherwise just remove the condition entirely
        else {
            token.actor.deleteEmbeddedDocuments("Item", [actorCond.id]);
            affectedTokens.push({ token: token, state: AffectedToken.ConditionRemoved })
        }
    }

    renderChatMessage(userId, cond.name, cond.img, false, false, affectedTokens);
}

const itemTag = "appliedCustomCondition";
const itemPrefix = itemTag + "_";
const getCustomBuffTag = (identifier) => itemPrefix + identifier;
const getCustomBuffOnActor = (actor, identifier) => actor.items
    .find(x => x.system.tag == identifier && x.type === "buff" && x.system.tags.includes(itemTag));

function getCustomConditionItem(itemId) {
    const item = game.items.get(itemId);
    return [item.toObject(), getCustomBuffTag(item.system.tag)];
}

function createCustomConditionItem(cond, newIdentifier, setDuration) {
    cond.system.active = true;
    cond.system.subType = "misc";
    cond.system.tag = newIdentifier;

    if (!cond.system.tags.includes(itemTag))
        cond.system.tags.push(itemTag);

    // If it doesn't include a "custom condition", add one; this causes the little label to pop up
    // TODO: BROKEN IN FOUNDRY V13/PF1e 11.8? the little label doesn't show up when a custom buff is removed 
    if (!cond.system.conditions.includes(cond.name))
        cond.system.conditions.push(cond.name);

    // Duration override
    if (setDuration.active && setDuration.value > 0) {
        const durSecs = getTotalSecondsOfCustomDuration(setDuration);
        cond.system.duration.units = "round"; // Seconds not supported here
        cond.system.duration.value = (durSecs / CONFIG.time.roundTime).toLocaleString();
        cond.system.duration.totalSeconds = durSecs;

        cond.system.duration.start = game.time.worldTime;
        // End timing type. Override our custom one with one the system can understand.
        cond.system.duration.end = setDuration.end === "initiativeEnd"
            ? "initiative"
            : setDuration.end;
    }

    cond.flags = cond.flags || {};
    cond.flags.lumos = { customConditionBuff: true };

    // Add data flag for the special initiative adjustment for the embedded active effect
    if (game.combat && setDuration.active && setDuration.end === "initiativeEnd") {
        cond.flags.lumos.initiativeEnd = getInitiativeForInitEndEffect();
    }
    
    return cond;
}

async function applyStatusEffect(userId, parameters, targets) {
    const { conditionId, _, __, setDuration } = parameters;

    const statusCond = pf1.registry.conditions.get(conditionId);
    const effect = createStatusEffect(statusCond.name, statusCond.texture, conditionId, setDuration);

    let affectedTokens = [];
    for (let token of targets) {
        const actorEffect = token.actor.effects.find(x => x.name === statusCond.name);
        // Status effects are never stackable (but their durations may be updated)    
        if (actorEffect && !setDuration.active) continue;

        if (!actorEffect)
            token.actor.createEmbeddedDocuments("ActiveEffect", [effect]);
        else {
            const updateInitEnd = game.combat && setDuration.end === "initiativeEnd";
            const targetInit = effect.flags.lumos?.initiativeEnd;
            actorEffect.update({
                duration: effect.duration,
                ...(updateInitEnd && getEffectUpdatesForInitEndEffect(targetInit)),
                ...(updateInitEnd && { "flags.lumos.initiativeEnd": targetInit })
            });
        }
        affectedTokens.push({ token: token, state: AffectedToken.ConditionAdded })
    }

    renderChatMessage(userId, effect.name, effect.icon, true, true, affectedTokens);
}

async function removeStatusEffect(userId, parameters, targets) {
    const { conditionId, _, __ } = parameters;

    const effect = pf1.registry.conditions.get(conditionId);

    let affectedTokens = [];
    for (let token of targets) {
        const actorEffect = token.actor.effects.find(x => x.name === effect.name);
        if (!actorEffect) continue;

        token.actor.deleteEmbeddedDocuments("ActiveEffect", [actorEffect._id]);
        affectedTokens.push({ token: token, state: AffectedToken.ConditionRemoved })
    }

    renderChatMessage(userId, effect.name, effect.texture, true, false, affectedTokens);
}

function createStatusEffect(name, icon, statusName, setDuration) {
    const effect = {
        name: name,
        icon: icon,
        statuses: [statusName],
        flags: {
            pf1: {
                autoDelete: true
            },
        }
    };
    if (setDuration.active) {
        // Not sure why active status effects are always set to a number of seconds even when 
        // you use rounds (when you right-click on a status in the buffs page), but I'm following suit, just to be safe...
        effect.duration = createStatusEffectDuration(setDuration);

        if (game.combat && setDuration.end === "initiativeEnd") {
            effect.duration.end = "initiative";
            effect.flags.lumos = { initiativeEnd: getInitiativeForInitEndEffect() };
        }
    }
    return effect;
}

function createStatusEffectDuration(setDuration) {
    console.log("status effect");
    const durationSecs = getTotalSecondsOfCustomDuration(setDuration);
    return {
        startTime: game.time.worldTime,
        duration: durationSecs,
        seconds: durationSecs,
        rounds: null,
        turns: null,
        startRound: game.combat ? game.combat.round : null,
        startTurn: game.combat ? game.combat.turn : null,
        type: "seconds",
    }
}

function getTotalSecondsOfCustomDuration(setDuration) {
    switch (setDuration.units) {
        case "round": return setDuration.value * CONFIG.time.roundTime;
        case "minute": return setDuration.value * 60;
        case "hour": return setDuration.value * 3600;
        default: return setDuration.value;
    }
}

async function renderChatMessage(userId, condName, condIcon, isStatus, eventWasCreation, affectedTokens) {
    if (affectedTokens.length === 0) {
        showMessageForUser(userId, eventWasCreation
            ? "All selected targets already had the chosen condition. Nothing happened."
            : "No selected targets had the chosen condition. Nothing happened.");
        return;
    }

    const tokenStateMap = {
        [AffectedToken.ConditionAdded]: ["Applied to:", []],
        [AffectedToken.ConditionIncreased]: ["Increased on:", []],
        [AffectedToken.ConditionRemoved]: ["Removed from:", []],
        [AffectedToken.ConditionDecreased]: ["Decreased on:", []],
    };
    affectedTokens.forEach(({ token, state }) => {
        tokenStateMap[state][1].push(token);
    });

    const chatMessageContent = await foundry.applications.handlebars
        .renderTemplate("modules/lumos-custom-conditions-for-pf1e/templates/custom-condition-chat-card.hbs", {
            condName,
            condIcon,
            isStatus,
            sections: Object.values(tokenStateMap)
                .map(([stateSectionText, tokens]) => ({ stateSectionText, tokens }))
                .filter(section => section.tokens.length > 0)
        });

    const targetUser = game.users.get(userId);
    const userControlledToken = targetUser.character?.getActiveTokens()[0] ||
        canvas.tokens.controlled.find(t => t.actor?.id === targetUser.character?.id) ||
        canvas.tokens.controlled[0];
    const speaker = userControlledToken
        ? { token: userControlledToken.id, actor: userControlledToken.actor?.id, alias: userControlledToken.name }
        : targetUser.character
            ? { actor: targetUser.character.id, alias: targetUser.character.name }
            : { user: userId, alias: targetUser.name };

    let chatMessage = ChatMessage.create({ // this is a promise
        user: userId,
        speaker: speaker,
        content: chatMessageContent,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { customConditionsMessage: true }
    });
    await chatMessage;
}

async function showMessageForUser(userId, message, state) {
    await socket.executeAsUser(showUIMessage, userId, message, state);
}

function checkRunningAsGM(userId) {
    if (!game.user.isGM) {
        showMessageForUser(userId, "Only the GM can call this directly.");
        return false;
    }
    return true;
}

function getUserTargets(userId) {
    const targets = game.users.get(userId).targets || [];
    if (targets.size === 0) {
        showMessageForUser(userId, "No tokens targeted.");
        return null;
    }
    return targets;
}