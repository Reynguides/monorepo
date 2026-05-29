-- Minimal Lua 5.1-compatible JSON encoder.
--
-- BG3SE exposes Ext.Json.Stringify at runtime, but the unit-test harness
-- runs under a vanilla `lua` interpreter without that table. Keeping our
-- own tiny encoder means tests verify exactly what the mod sends.
--
-- Supports: nil, boolean, number, string, table (treated as object when it
-- has any non-integer-indexed keys, otherwise array). Numbers go through
-- string.format("%g") so integer values serialise without a decimal point.
-- Strings are escaped per RFC 8259 \" \\ \b \f \n \r \t and \uXXXX for
-- control chars below 0x20.

local json = {}

local function encode_string(s)
    local result = '"'
    for i = 1, #s do
        local c = s:sub(i, i)
        local b = c:byte()
        if c == '"' then
            result = result .. '\\"'
        elseif c == '\\' then
            result = result .. '\\\\'
        elseif b == 0x08 then result = result .. '\\b'
        elseif b == 0x09 then result = result .. '\\t'
        elseif b == 0x0A then result = result .. '\\n'
        elseif b == 0x0C then result = result .. '\\f'
        elseif b == 0x0D then result = result .. '\\r'
        elseif b < 0x20 then
            result = result .. string.format('\\u%04x', b)
        else
            result = result .. c
        end
    end
    return result .. '"'
end

local function is_array(t)
    -- Treat an empty table as an array. Otherwise: every key must be a
    -- positive integer from 1..N with no gaps.
    local n = 0
    for k, _ in pairs(t) do
        if type(k) ~= "number" then return false end
        if k > n then n = k end
    end
    for i = 1, n do
        if t[i] == nil then return false end
    end
    return true, n
end

local encode -- forward declaration for recursion.

local function encode_array(t, n)
    local parts = {}
    for i = 1, n do
        parts[#parts + 1] = encode(t[i])
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function encode_object(t)
    -- Stable key order: alphabetical. Avoids non-determinism that would
    -- bite tests on different Lua builds.
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do
        parts[#parts + 1] = encode_string(k) .. ":" .. encode(t[k])
    end
    return "{" .. table.concat(parts, ",") .. "}"
end

encode = function(value)
    local t = type(value)
    if value == nil then
        return "null"
    elseif t == "boolean" then
        return value and "true" or "false"
    elseif t == "number" then
        if value ~= value or value == math.huge or value == -math.huge then
            error("json.encode: cannot serialise NaN/Inf")
        end
        return string.format("%.17g", value):gsub("%.0+$", "")
    elseif t == "string" then
        return encode_string(value)
    elseif t == "table" then
        local isArr, n = is_array(value)
        if isArr then
            return encode_array(value, n or 0)
        end
        return encode_object(value)
    else
        error("json.encode: unsupported type " .. t)
    end
end

function json.encode(value)
    return encode(value)
end

return json
