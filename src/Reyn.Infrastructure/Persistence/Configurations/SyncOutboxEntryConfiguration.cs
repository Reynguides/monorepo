using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Reyn.Domain;

namespace Reyn.Infrastructure.Persistence.Configurations;

internal sealed class SyncOutboxEntryConfiguration : IEntityTypeConfiguration<SyncOutboxEntry>
{
    public void Configure(EntityTypeBuilder<SyncOutboxEntry> builder)
    {
        builder.ToTable("sync_outbox");

        builder.HasKey(x => x.EventId);
        builder.Property(x => x.PayloadHash).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Status).IsRequired();
        builder.Property(x => x.CreatedAt).IsRequired();

        // Drive the outbox processor's "what to send next" query.
        builder.HasIndex(x => new { x.Status, x.NextAttemptAt });
    }
}
