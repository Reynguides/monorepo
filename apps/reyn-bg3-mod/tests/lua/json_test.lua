local h = require("helpers")
local json = require("json")

local suite = h.suite("json")

suite:case("encodes nil as null", function()
    h.assert_equal(json.encode(nil), "null")
end)

suite:case("encodes booleans", function()
    h.assert_equal(json.encode(true), "true")
    h.assert_equal(json.encode(false), "false")
end)

suite:case("encodes integers without decimals", function()
    h.assert_equal(json.encode(42), "42")
    h.assert_equal(json.encode(-7), "-7")
    h.assert_equal(json.encode(0), "0")
end)

suite:case("encodes floats", function()
    -- We use %.17g so floats round-trip via parsers.
    h.assert_contains(json.encode(1.5), "1.5")
end)

suite:case("encodes ascii strings", function()
    h.assert_equal(json.encode("hello"), '"hello"')
end)

suite:case("escapes quotes + backslash", function()
    h.assert_equal(json.encode('he said "hi"'), '"he said \\"hi\\""')
    h.assert_equal(json.encode("a\\b"), '"a\\\\b"')
end)

suite:case("escapes control chars", function()
    h.assert_equal(json.encode("\n"), '"\\n"')
    h.assert_equal(json.encode("\t"), '"\\t"')
    h.assert_equal(json.encode("\r"), '"\\r"')
    h.assert_equal(json.encode("\b"), '"\\b"')
    h.assert_equal(json.encode("\f"), '"\\f"')
    h.assert_contains(json.encode("\1"), "\\u0001")
end)

suite:case("encodes arrays as JSON arrays", function()
    h.assert_equal(json.encode({1, 2, 3}), "[1,2,3]")
    h.assert_equal(json.encode({"a", "b"}), '["a","b"]')
end)

suite:case("encodes empty table as array", function()
    h.assert_equal(json.encode({}), "[]")
end)

suite:case("encodes objects with stable key order", function()
    -- Alphabetical ordering — same input always yields same string,
    -- which makes tests deterministic across Lua builds.
    h.assert_equal(
        json.encode({ source = "bg3se", level = 5, characterId = "tav" }),
        '{"characterId":"tav","level":5,"source":"bg3se"}'
    )
end)

suite:case("encodes nested objects", function()
    h.assert_equal(
        json.encode({ outer = { inner = 1 } }),
        '{"outer":{"inner":1}}'
    )
end)

suite:case("rejects NaN / Inf", function()
    local ok = pcall(function() json.encode(0 / 0) end)
    h.assert_false(ok, "NaN should throw")
    local ok2 = pcall(function() json.encode(math.huge) end)
    h.assert_false(ok2, "Inf should throw")
end)

return suite
