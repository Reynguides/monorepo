using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Reyn.Domain;

namespace Reyn.Infrastructure.Persistence.Configurations;

internal sealed class GameEventConfiguration : IEntityTypeConfiguration<GameEvent>
{
    public void Configure(EntityTypeBuilder<GameEvent> builder)
    {
        builder.ToTable("game_events");

        builder.HasKey(x => x.EventId);
        builder.Property(x => x.UserId).HasMaxLength(128).IsRequired();
        builder.Property(x => x.Type).HasMaxLength(128).IsRequired();
        builder.Property(x => x.OccurredAt).IsRequired();
        builder.Property(x => x.PayloadJson).IsRequired();
        builder.Property(x => x.ContentHash).HasMaxLength(64).IsRequired();
        builder.Property(x => x.ReceivedAt).IsRequired();

        // Per ADR-0007: dedupe at the source. Identical content from the
        // same user can never produce two rows.
        builder.HasIndex(x => new { x.UserId, x.ContentHash }).IsUnique();
        builder.HasIndex(x => new { x.UserId, x.OccurredAt });
    }
}
