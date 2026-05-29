using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Reyn.Infrastructure.Persistence;
using Xunit;

namespace Reyn.Infrastructure.Tests.Persistence;

public sealed class MigrationSmokeTests
{
    [Fact]
    public async Task MigrateAsync_creates_every_expected_table()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<ReynDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var db = new ReynDbContext(options);
        await db.Database.MigrateAsync();

        var actualTables = await ListUserTablesAsync(connection);

        actualTables.Should().BeEquivalentTo(new[]
        {
            "__EFMigrationsHistory",
            "user_accounts",
            "sessions",
            "game_events",
            "achievements",
            "play_sessions",
            "sync_outbox",
            "request_logs",
        });
    }

    [Fact]
    public async Task MigrateAsync_records_initial_migration_in_history()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<ReynDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var db = new ReynDbContext(options);
        await db.Database.MigrateAsync();

        var applied = await db.Database.GetAppliedMigrationsAsync();

        applied.Should().ContainSingle()
            .Which.Should().EndWith("_Initial");
    }

    private static async Task<List<string>> ListUserTablesAsync(SqliteConnection connection)
    {
        var tables = new List<string>();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name;
            """;
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString(0));
        }
        return tables;
    }
}
