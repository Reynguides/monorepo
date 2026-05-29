-- Tiny test harness — minimal because we don't want to drag in busted/luaunit
-- across two Lua versions (5.1 in BG3SE, 5.4 on the dev host, CI Linux).
--
-- Usage:
--   local h = require("helpers")
--   local suite = h.suite("name")
--   suite:case("foo bar baz", function() h.assert_equal(1, 1) end)
--   return suite

local M = {}

M.failures = {}
M.passed = 0
M.total = 0

local function format_value(v)
    if type(v) == "table" then
        local parts = {}
        for k, value in pairs(v) do
            parts[#parts + 1] = tostring(k) .. "=" .. tostring(value)
        end
        return "{" .. table.concat(parts, ", ") .. "}"
    end
    return tostring(v)
end

function M.assert_equal(actual, expected, message)
    if actual ~= expected then
        error(string.format(
            "expected %s, got %s%s",
            format_value(expected),
            format_value(actual),
            message and (" — " .. message) or ""), 2)
    end
end

function M.assert_true(value, message)
    if not value then
        error(string.format("expected truthy, got %s%s",
            format_value(value),
            message and (" — " .. message) or ""), 2)
    end
end

function M.assert_false(value, message)
    if value then
        error(string.format("expected falsey, got %s%s",
            format_value(value),
            message and (" — " .. message) or ""), 2)
    end
end

function M.assert_contains(haystack, needle, message)
    if type(haystack) ~= "string" or not haystack:find(needle, 1, true) then
        error(string.format("expected %q to contain %q%s",
            tostring(haystack), tostring(needle),
            message and (" — " .. message) or ""), 2)
    end
end

function M.assert_nil(value, message)
    if value ~= nil then
        error(string.format("expected nil, got %s%s",
            format_value(value),
            message and (" — " .. message) or ""), 2)
    end
end

function M.assert_not_nil(value, message)
    if value == nil then
        error(string.format("expected non-nil%s",
            message and (" — " .. message) or ""), 2)
    end
end

-- Build a minimal BG3SE Ext stub. Tests that exercise Adapter.register
-- (the one place that calls into Ext) instantiate this and inspect
-- recorded subscriptions.
function M.new_ext_stub()
    local stub = { osirisCalls = {}, appendedFiles = {} }
    stub.Osiris = {
        RegisterListener = function(event, arity, when, callback)
            table.insert(stub.osirisCalls, {
                event = event, arity = arity, when = when, callback = callback,
            })
        end,
    }
    stub.IO = {
        AppendFile = function(path, contents)
            stub.appendedFiles[path] = (stub.appendedFiles[path] or "") .. contents
        end,
    }
    stub.Utils = {
        PrintWarning = function(_) end,
        Print = function(_) end,
    }
    return stub
end

local Suite = {}
Suite.__index = Suite

function Suite:case(name, fn)
    self.cases[#self.cases + 1] = { name = name, fn = fn }
end

function Suite:run()
    for _, case in ipairs(self.cases) do
        M.total = M.total + 1
        local ok, err = pcall(case.fn)
        if ok then
            M.passed = M.passed + 1
        else
            M.failures[#M.failures + 1] = {
                suite = self.name,
                case = case.name,
                err = err,
            }
        end
    end
end

function M.suite(name)
    return setmetatable({ name = name, cases = {} }, Suite)
end

function M.report()
    for _, f in ipairs(M.failures) do
        io.stderr:write(string.format("FAIL [%s] %s\n  %s\n", f.suite, f.case, tostring(f.err)))
    end
    io.write(string.format("\n%d passed / %d total — %d failures\n",
        M.passed, M.total, #M.failures))
    return #M.failures == 0
end

return M
