-- Reyn event transport.
--
-- BG3SE Lua can't open TCP sockets (no LuaSocket, no Ext.Net for arbitrary
-- endpoints), so the production transport writes newline-delimited JSON
-- to a known file:
--
--   %LocalAppData%\Reyn\bg3-events.jsonl
--
-- The Reyn desktop will add a Bg3FileEventSource in Phase 11 that
-- watches this file alongside the existing Bg3SocketEventSource. Until
-- then, the file is the authoritative ingestion path for events emitted
-- by this mod.
--
-- Tests stub the transport by replacing `M.send` directly.

local M = {}

-- The relative path the BG3SE engine resolves against the user's data dir
-- (usually %LocalAppData%\Larian Studios\Baldur's Gate 3\Script Extender\).
-- Phase 11 may relocate the file once the desktop's file-watcher source
-- lands.
M.RELATIVE_PATH = "Reyn/bg3-events.jsonl"

-- Buffered writes. BG3SE's Ext.IO.AppendFile is synchronous and somewhat
-- expensive (file open per call); we batch up to BATCH_SIZE lines or
-- BATCH_FLUSH_INTERVAL seconds, whichever comes first.
M.BATCH_SIZE = 16
M.BATCH_FLUSH_INTERVAL = 2.0

local buffer = {}
local lastFlush = 0

-- Pluggable hooks for tests. Defaults call into BG3SE's Ext when present;
-- in pure-Lua test runs the test harness replaces them with stubs.
M.now = function()
    return os.time()
end

M.write = function(path, line)
    if Ext and Ext.IO and Ext.IO.AppendFile then
        Ext.IO.AppendFile(path, line)
    else
        -- Local fallback when running outside BG3SE (e.g. headless tests
        -- that didn't replace M.write). Writes next to the cwd.
        local f, err = io.open(path, "ab")
        if not f then
            error("transport.write: could not open " .. tostring(path) .. " (" .. tostring(err) .. ")")
        end
        f:write(line)
        f:close()
    end
end

-- Push one event line into the buffer. Flushes when BATCH_SIZE is reached
-- or BATCH_FLUSH_INTERVAL seconds have passed since the last flush.
function M.send(line)
    table.insert(buffer, line)
    local now = M.now()
    if #buffer >= M.BATCH_SIZE or (now - lastFlush) >= M.BATCH_FLUSH_INTERVAL then
        M.flush()
        lastFlush = now
    end
end

-- Write any buffered lines and reset. Called automatically by send() when
-- thresholds trip; can also be called by tests or at session end.
function M.flush()
    if #buffer == 0 then
        return 0
    end
    local payload = table.concat(buffer, "\n") .. "\n"
    M.write(M.RELATIVE_PATH, payload)
    local n = #buffer
    buffer = {}
    return n
end

-- Test seam: empties the buffer without writing. Used in unit tests to
-- isolate cases.
function M.reset()
    buffer = {}
    lastFlush = 0
end

-- Test seam: peek at buffered lines without flushing.
function M.peek()
    local copy = {}
    for i, v in ipairs(buffer) do copy[i] = v end
    return copy
end

return M
