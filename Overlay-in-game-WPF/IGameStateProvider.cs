namespace Overlay_in_game_WPF
{
    public interface IGameStateProvider
    {
        event EventHandler<GameStateReceivedEventArgs>? OnGameStateReceived;
        void Start();
        void Stop();
    }
}