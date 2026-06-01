local h = require("helpers")
local Catalog = require("Catalog")
local Bootstrap = require("BootstrapServer")
local transport = require("transport")

local suite = h.suite("bootstrap")

-- Each test pins the clock and isolates transport so we can assert on
-- exactly what would be sent.
local function fresh()
    transport.reset()
    transport.write = function() end -- swallow
    Bootstrap.now = function() return 1700000000000 end
    local recorded = {}
    -- Stub the adapter so register() captures subscriptions instead of
    -- calling into Ext.
    Bootstrap.Adapter.register = function(event, arity, when, callback)
        recorded[#recorded + 1] = { event = event, arity = arity, when = when, callback = callback }
    end
    return recorded
end

suite:case("Handlers.character_died maps guid to catalog payload", function()
    fresh()
    local event = Bootstrap.Handlers.character_died(1700000000000, "guid-tav", "guid-shadowheart")
    h.assert_equal(event.type, Catalog.CharacterDied)
    h.assert_equal(event.payload.source, "bg3se")
    h.assert_equal(event.payload.characterId, "guid-tav")
end)

suite:case("Handlers.level_up parses level number", function()
    local event = Bootstrap.Handlers.level_up(1, "guid-tav", "5")
    h.assert_equal(event.type, Catalog.CharacterLevelUp)
    h.assert_equal(event.payload.level, 5)
end)

suite:case("Handlers.combat_ended captures victory + round count", function()
    local event = Bootstrap.Handlers.combat_ended(1, "combat-1", true, 4)
    h.assert_equal(event.type, Catalog.CombatEnded)
    h.assert_equal(event.payload.victory, true)
    h.assert_equal(event.payload.roundCount, 4)
end)

suite:case("Handlers.enemy_killed omits byCharacterId when nil", function()
    local event = Bootstrap.Handlers.enemy_killed(1, "goblin-7", nil)
    h.assert_equal(event.type, Catalog.EnemyKilled)
    h.assert_nil(event.payload.byCharacterId)
end)

suite:case("Handlers.enemy_killed includes byCharacterId when present", function()
    local event = Bootstrap.Handlers.enemy_killed(1, "goblin-7", "tav-1")
    h.assert_equal(event.payload.byCharacterId, "tav-1")
end)

suite:case("Handlers.region_entered stringifies non-string regions", function()
    local event = Bootstrap.Handlers.region_entered(1, 42)
    h.assert_equal(event.payload.region, "42")
end)

suite:case("Handlers.rest_long carries camp:true", function()
    local event = Bootstrap.Handlers.rest_long(1)
    h.assert_equal(event.payload.camp, true)
end)

suite:case("bootstrap() registers all subscriptions on the adapter", function()
    local recorded = fresh()
    Bootstrap.bootstrap()
    h.assert_equal(#recorded, #Bootstrap.Subscriptions)
    -- Spot-check: every recorded event has an Osiris listener arity in range
    for _, sub in ipairs(recorded) do
        h.assert_not_nil(sub.event)
        h.assert_true(sub.arity >= 0 and sub.arity <= 3, "arity out of range")
        h.assert_equal(sub.when, "after")
    end
end)

suite:case("bootstrap() Osiris callback emits the catalog event through transport", function()
    local recorded = fresh()
    -- Collect everything sent to transport.
    local sent = {}
    transport.send = function(line) sent[#sent + 1] = line end
    Bootstrap.bootstrap()
    -- Find the CharacterDied subscription and fire its callback.
    local died
    for _, sub in ipairs(recorded) do
        if sub.event == "CharacterDied" then died = sub end
    end
    h.assert_not_nil(died)
    died.callback("guid-tav", "guid-attacker")
    h.assert_equal(#sent, 1)
    h.assert_contains(sent[1], '"type":"' .. Catalog.CharacterDied .. '"')
    h.assert_contains(sent[1], '"characterId":"guid-tav"')
end)

suite:case("every Subscription.handler resolves to a real Handlers.* function", function()
    for _, sub in ipairs(Bootstrap.Subscriptions) do
        h.assert_not_nil(Bootstrap.HandlerFor(sub.handler),
            "missing handler: " .. tostring(sub.handler))
    end
end)

suite:case("each Subscription handler emits its expected catalog type", function()
    -- Guards against handler mis-wiring (e.g. ItemPickedUp routed to the
    -- enemy_killed handler). Every Osiris subscription must emit the catalog
    -- type that matches its semantic event.
    local expected = {
        CharacterDied = Catalog.CharacterDied,
        CharacterResurrected = Catalog.CharacterRevived,
        LeveledUp = Catalog.CharacterLevelUp,
        CombatStarted = Catalog.CombatStarted,
        CombatEnded = Catalog.CombatEnded,
        RegionStarted = Catalog.RegionEntered,
        RegionEnded = Catalog.RegionExited,
        QuestStarted = Catalog.QuestStarted,
        QuestUpdated = Catalog.QuestUpdated,
        QuestComplete = Catalog.QuestCompleted,
        LongRestRequested = Catalog.RestLong,
        ItemPickedUp = Catalog.ItemPickedUp,
        RealtimeLoaded = Catalog.SessionStarted,
        GameOver = Catalog.SessionEnded,
    }
    for _, sub in ipairs(Bootstrap.Subscriptions) do
        local want = expected[sub.osirisEvent]
        h.assert_not_nil(want, "no expected type mapped for " .. tostring(sub.osirisEvent))
        local handler = Bootstrap.HandlerFor(sub.handler)
        h.assert_not_nil(handler, "missing handler: " .. tostring(sub.handler))
        local event = handler(1700000000000)
        h.assert_equal(event.type, want,
            "subscription " .. tostring(sub.osirisEvent) .. " emitted wrong catalog type")
    end
end)

suite:case("Catalog.All has 28 unique event types", function()
    h.assert_equal(#Catalog.All, 28)
    local seen = {}
    for _, t in ipairs(Catalog.All) do
        h.assert_nil(seen[t], "duplicate type: " .. t)
        seen[t] = true
    end
end)

return suite
