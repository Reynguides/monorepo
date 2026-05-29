namespace Reyn.Contracts.Events;

/// <summary>
/// Strongly-typed payload records for the event types the desktop UI
/// renders directly (overlay HUD, dashboard charts). Less-used payloads
/// stay as raw JSON strings on <c>GameEvent.PayloadJson</c> — the desktop
/// extracts fields on demand (see <c>GameEventQueryService.ReadStringField</c>).
///
/// Field names match the camelCase JSON keys produced by the catalog.
/// </summary>
public sealed record Bg3PartyMember(string Id, string Name, int Hp, int MaxHp);

public sealed record Bg3PartyHpChangedPayload(string Source, IReadOnlyList<Bg3PartyMember> Members);

public sealed record Bg3CharacterLevelUpPayload(string Source, string CharacterId, int Level);

public sealed record Bg3EnemyKilledPayload(string Source, string Enemy, string? ByCharacterId);

public sealed record Bg3RegionEnteredPayload(string Source, string Region);

public sealed record Bg3DialogueChoicePayload(string Source, string Choice, string? Outcome);
