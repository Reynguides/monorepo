-- BG3SE entry point. Required filename per the BG3SE convention; this is
-- what Script Extender loads when the mod activates on the server side.
--
-- The actual work happens in BootstrapServer.lua — keeping init.lua
-- trivial means a future change to the load order or split (e.g.
-- adding a client-side script) doesn't have to touch this file.

Ext.Require("BootstrapServer.lua")
local Bootstrap = Mods.ReynCompanion.BootstrapServer

-- Listeners are registered eagerly. RealtimeLoaded fires after the listener
-- is attached, so we'll see it as the first event in the session.
Bootstrap.bootstrap()
Ext.Utils.PrintWarning("[Reyn] Companion mod loaded — Osiris listeners active.")
