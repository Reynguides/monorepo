using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Reyn.Application.Ingestion;

namespace Reyn.Infrastructure.Ingestion;

/// <summary>
/// Polls <see cref="IGameDetector"/> on <see cref="Bg3DetectionOptions.PollInterval"/>
/// (default 2s) and pushes state transitions through
/// <see cref="IBg3DetectionWriter"/>. The overlay window subscribes
/// downstream via <see cref="IBg3DetectionPublisher.Changed"/>.
/// </summary>
public sealed partial class Bg3ProcessDetectorService(
    IGameDetector detector,
    IBg3DetectionWriter writer,
    IOptions<Bg3DetectionOptions> options,
    ILogger<Bg3ProcessDetectorService> log) : BackgroundService
{
    private readonly TimeSpan _interval = options.Value.PollInterval;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        DateTime? firstDetectedAt = null;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var running = detector.IsBg3Running();
                if (running && firstDetectedAt is null)
                {
                    firstDetectedAt = DateTime.UtcNow;
                }
                else if (!running)
                {
                    firstDetectedAt = null;
                }
                writer.Publish(new Bg3DetectionState(running, firstDetectedAt));
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Log.PollFailed(log, ex);
            }
            await Task.Delay(_interval, stoppingToken).ConfigureAwait(false);
        }
    }

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Warning, Message = "Bg3ProcessDetectorService poll failed")]
        public static partial void PollFailed(ILogger logger, Exception ex);
    }
}

/// <summary>Tunables for the BG3 detector loop.</summary>
public sealed class Bg3DetectionOptions
{
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromSeconds(2);
}
