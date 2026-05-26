using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;

namespace Overlay_in_game_WPF
{
    public class GsiServer : IGameStateProvider
    {
        private WebApplication? _app;
        private Task? _serverTask;
        private CancellationTokenSource? _cancellationTokenSource;

        public event EventHandler<GameStateReceivedEventArgs>? OnGameStateReceived;

        public void Start()
        {
            _cancellationTokenSource = new CancellationTokenSource();

            _serverTask = Task.Run(async () =>
            {
                var builder = WebApplication.CreateBuilder();
                builder.WebHost.UseUrls("http://localhost:3000");
                var app = builder.Build();

                app.MapPost("/", HandlePostRequest);

                _app = app;
                await app.RunAsync(_cancellationTokenSource.Token);
            });
        }

        public void Stop()
        {
            _cancellationTokenSource?.Cancel();
            _serverTask?.Wait(TimeSpan.FromSeconds(5));
        }

        private async Task HandlePostRequest(HttpContext context)
        {
            try
            {
                using var reader = new StreamReader(context.Request.Body);
                string requestBody = await reader.ReadToEndAsync();

                var options = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
                    UnknownTypeHandling = JsonUnknownTypeHandling.JsonElement
                };

                var gameState = JsonSerializer.Deserialize<GameState>(requestBody, options);

                if (gameState != null)
                {
                    OnGameStateReceived?.Invoke(this, new GameStateReceivedEventArgs { GameState = gameState });
                }

                context.Response.StatusCode = 200;
                await context.Response.WriteAsync("OK");
            }
            catch (Exception ex)
            {
                context.Response.StatusCode = 400;
                await context.Response.WriteAsync($"Error: {ex.Message}");
            }
        }
    }

    public class GameStateReceivedEventArgs : EventArgs
    {
        public required GameState GameState { get; set; }
    }
}
