local h = require("helpers")
local transport = require("transport")

local suite = h.suite("transport")

-- Test isolation: stub the write hook + clock per-case.
local function fresh()
    transport.reset()
    local written = {}
    transport.write = function(path, line)
        written[#written + 1] = { path = path, line = line }
    end
    local clock = 0
    transport.now = function() return clock end
    return written, function(advance) clock = clock + advance end
end

suite:case("buffers events below BATCH_SIZE", function()
    local written = fresh()
    transport.send('{"a":1}')
    transport.send('{"a":2}')
    h.assert_equal(#written, 0, "no flush before threshold")
    h.assert_equal(#transport.peek(), 2)
end)

suite:case("flushes at BATCH_SIZE", function()
    local written = fresh()
    for i = 1, transport.BATCH_SIZE do
        transport.send('{"n":' .. i .. '}')
    end
    h.assert_equal(#written, 1, "single batched write")
    h.assert_equal(#transport.peek(), 0)
    h.assert_contains(written[1].line, '{"n":1}')
    h.assert_contains(written[1].line, '{"n":' .. transport.BATCH_SIZE .. '}')
end)

suite:case("flushes after BATCH_FLUSH_INTERVAL even with few entries", function()
    local written, advance = fresh()
    transport.send('{"first":true}')
    h.assert_equal(#written, 0)
    advance(transport.BATCH_FLUSH_INTERVAL + 1)
    transport.send('{"second":true}')
    -- After the time-trip, send() should flush. The previous case left
    -- buffer with 1; the time trip flushes 1+1=2.
    h.assert_equal(#written, 1)
end)

suite:case("explicit flush returns count and clears buffer", function()
    local written = fresh()
    transport.send('{"x":1}')
    transport.send('{"x":2}')
    local n = transport.flush()
    h.assert_equal(n, 2)
    h.assert_equal(#written, 1)
    h.assert_equal(#transport.peek(), 0)
end)

suite:case("flush on empty buffer is a no-op", function()
    local written = fresh()
    local n = transport.flush()
    h.assert_equal(n, 0)
    h.assert_equal(#written, 0)
end)

suite:case("writes to the configured RELATIVE_PATH", function()
    local written = fresh()
    transport.send('{"x":1}')
    transport.flush()
    h.assert_equal(written[1].path, transport.RELATIVE_PATH)
end)

return suite
