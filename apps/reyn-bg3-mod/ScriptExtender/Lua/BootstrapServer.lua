-- Reyn BG3SE bootstrap (Server-side Osiris listeners).
--
-- BG3SE invokes this file when the mod loads on the server (campaign /
-- single-player) side. We subscribe to a curated set of Osiris events,
-- shape each into a catalog-aligned payload, and push through transport.
--
-- The listener handlers are factored into pure functions (`Handlers.*`)
-- that take the raw Osiris args + a clock and return a `{type, payload}`
-- table. The Osiris adapter (`Adapter.register`) is the only piece that
-- talks to Ext.Osiris.RegisterListener — tests stub it directly.

local Catalog = require("Catalog")
local json = require("json")
local transport = require("transport")

local M = {}

-- ─── Pure handlers ──────────────────────────────────────────────────
-- Each returns { type = "...", payload = {...} } or nil to suppress.
-- `now` is injected so tests can pin the timestamp.

local Handlers = {}

local function source()
    return "bg3se"
end

function Handlers.session_started(now)
    return {
        type = Catalog.SessionStarted,
        occurredAt = now,
        payload = { source = source() },
    }
end

function Handlers.session_ended(now)
    return {
        type = Catalog.SessionEnded,
        occurredAt = now,
        payload = { source = source() },
    }
end

function Handlers.game_loaded(now, saveName)
    return {
        type = Catalog.GameLoaded,
        occurredAt = now,
        payload = { source = source(), saveName = saveName or "" },
    }
end

function Handlers.character_died(now, characterGuid, _attackerGuid)
    return {
        type = Catalog.CharacterDied,
        occurredAt = now,
        payload = { source = source(), characterId = tostring(characterGuid or "") },
    }
end

function Handlers.character_revived(now, characterGuid)
    return {
        type = Catalog.CharacterRevived,
        occurredAt = now,
        payload = { source = source(), characterId = tostring(characterGuid or "") },
    }
end

function Handlers.level_up(now, characterGuid, level)
    return {
        type = Catalog.CharacterLevelUp,
        occurredAt = now,
        payload = {
            source = source(),
            characterId = tostring(characterGuid or ""),
            level = tonumber(level) or 0,
        },
    }
end

function Handlers.combat_started(now, combatGuid)
    return {
        type = Catalog.CombatStarted,
        occurredAt = now,
        payload = { source = source(), encounter = tostring(combatGuid or "") },
    }
end

function Handlers.combat_ended(now, combatGuid, victory, roundCount)
    return {
        type = Catalog.CombatEnded,
        occurredAt = now,
        payload = {
            source = source(),
            encounter = tostring(combatGuid or ""),
            victory = victory == true,
            roundCount = tonumber(roundCount) or 0,
        },
    }
end

function Handlers.enemy_killed(now, victimGuid, attackerGuid)
    return {
        type = Catalog.EnemyKilled,
        occurredAt = now,
        payload = {
            source = source(),
            enemy = tostring(victimGuid or ""),
            byCharacterId = attackerGuid and tostring(attackerGuid) or nil,
        },
    }
end

function Handlers.region_entered(now, regionName)
    return {
        type = Catalog.RegionEntered,
        occurredAt = now,
        payload = { source = source(), region = tostring(regionName or "") },
    }
end

function Handlers.region_exited(now, regionName)
    return {
        type = Catalog.RegionExited,
        occurredAt = now,
        payload = { source = source(), region = tostring(regionName or "") },
    }
end

function Handlers.quest_started(now, questId)
    return {
        type = Catalog.QuestStarted,
        occurredAt = now,
        payload = { source = source(), quest = tostring(questId or "") },
    }
end

function Handlers.quest_updated(now, questId, state)
    return {
        type = Catalog.QuestUpdated,
        occurredAt = now,
        payload = {
            source = source(),
            quest = tostring(questId or ""),
            state = state and tostring(state) or nil,
        },
    }
end

function Handlers.quest_completed(now, questId)
    return {
        type = Catalog.QuestCompleted,
        occurredAt = now,
        payload = { source = source(), quest = tostring(questId or "") },
    }
end

function Handlers.rest_long(now)
    return {
        type = Catalog.RestLong,
        occurredAt = now,
        payload = { source = source(), camp = true },
    }
end

function Handlers.item_picked_up(now, itemGuid, characterGuid)
    return {
        type = Catalog.ItemPickedUp,
        occurredAt = now,
        payload = {
            source = source(),
            item = tostring(itemGuid or ""),
            byCharacterId = characterGuid and tostring(characterGuid) or nil,
        },
    }
end

-- ─── Adapter (Osiris ↔ handlers) ────────────────────────────────────
--
-- Wires each Osiris listener to its handler. `register` is the single
-- entrypoint that touches Ext.Osiris.RegisterListener; tests replace it
-- with a stub that records the (event, arity, when, callback) tuples.

local Adapter = {}

Adapter.register = function(event, arity, when, callback)
    if Ext and Ext.Osiris and Ext.Osiris.RegisterListener then
        Ext.Osiris.RegisterListener(event, arity, when, callback)
    end
end

-- The full subscription list. Each row: { osirisEvent, arity, when, handlerName }.
-- The Osiris event names + arities match what BG3SE exposes; the
-- handler name picks the matching `Handlers.*` function above.
--
-- 14 high-signal events; lower-signal types (item_used, inspiration_gained,
-- spell_cast, skill_check_rolled, dialogue events, inventory_dropped,
-- party_member_left, rest_short) are deferred to Phase 11 — they need
-- additional Osiris listener arity work or BG3 query calls.
M.Subscriptions = {
    { osirisEvent = "CharacterDied",        arity = 2, when = "after", handler = "character_died" },
    { osirisEvent = "CharacterResurrected", arity = 1, when = "after", handler = "character_revived" },
    { osirisEvent = "LeveledUp",            arity = 1, when = "after", handler = "level_up" },
    { osirisEvent = "CombatStarted",        arity = 1, when = "after", handler = "combat_started" },
    { osirisEvent = "CombatEnded",          arity = 1, when = "after", handler = "combat_ended" },
    { osirisEvent = "RegionStarted",        arity = 1, when = "after", handler = "region_entered" },
    { osirisEvent = "RegionEnded",          arity = 1, when = "after", handler = "region_exited" },
    { osirisEvent = "QuestStarted",         arity = 1, when = "after", handler = "quest_started" },
    { osirisEvent = "QuestUpdated",         arity = 2, when = "after", handler = "quest_updated" },
    { osirisEvent = "QuestComplete",        arity = 1, when = "after", handler = "quest_completed" },
    { osirisEvent = "LongRestRequested",    arity = 0, when = "after", handler = "rest_long" },
    { osirisEvent = "ItemPickedUp",         arity = 2, when = "after", handler = "item_picked_up" },
    { osirisEvent = "RealtimeLoaded",       arity = 0, when = "after", handler = "session_started" },
    { osirisEvent = "GameOver",             arity = 0, when = "after", handler = "session_ended" },
}

-- ─── Public API ─────────────────────────────────────────────────────

M.Handlers = Handlers
M.Adapter = Adapter

-- Build the inverse map handlerName → function, validated against
-- M.Subscriptions. Used by the dispatcher and tests.
M.HandlerFor = function(name)
    return Handlers[name]
end

-- Default clock — replaced in tests with a stub returning fixed numbers.
M.now = function()
    return os.time() * 1000  -- catalog times are unix-ms
end

-- Format + push one catalog event through transport. Public so tests
-- can verify the full serialise+send pipeline with a stubbed transport.
function M.emit(event)
    if event == nil then
        return
    end
    transport.send(json.encode(event))
end

-- Wire up every Osiris listener. Idempotent: calling twice is a no-op
-- because Ext.Osiris is the dedup gatekeeper.
function M.bootstrap()
    for _, sub in ipairs(M.Subscriptions) do
        local handlerName = sub.handler
        local handler = Handlers[handlerName]
        if handler then
            Adapter.register(sub.osirisEvent, sub.arity, sub.when, function(...)
                local event = handler(M.now(), ...)
                M.emit(event)
            end)
        end
    end
end

return M
