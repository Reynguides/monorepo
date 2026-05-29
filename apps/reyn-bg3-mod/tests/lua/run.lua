-- Entry runner. Run from apps/reyn-bg3-mod/:
--   lua tests/lua/run.lua
--
-- Loads the mod's Lua libraries (ScriptExtender/Lua/*) onto the package
-- path, then executes each *_test.lua suite. Exits non-zero on any failure
-- so CI fails the job.

local script_dir = arg[0]:match("(.*[/\\])") or "./"
package.path = table.concat({
    script_dir .. "?.lua",
    script_dir .. "../../ScriptExtender/Lua/?.lua",
    package.path,
}, ";")

local h = require("helpers")

-- Parens on each require: Lua 5.4's require returns (module, loadedFromPath),
-- and table constructors splay multiple return values. Without the parens
-- the suites table ends up with stray strings at the tail.
local suites = {
    (require("json_test")),
    (require("transport_test")),
    (require("bootstrap_test")),
}

for _, suite in ipairs(suites) do
    suite:run()
end

local ok = h.report()
os.exit(ok and 0 or 1)
