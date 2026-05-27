using Microsoft.Extensions.DependencyInjection;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace Overlay_in_game_WPF
{
    public partial class MainWindow : Window
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_LAYERED = 0x80000;
        private const int WS_EX_TRANSPARENT = 0x20;
        private const int WS_EX_TOPMOST = 0x00000008;

        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
        private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
        private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        private DispatcherTimer _checkTimer;
        private IGameStateProvider _gameStateProvider;
        private KnowledgeBase _knowledgeBase;
        private AiHintService _aiHintService;

        private readonly ProxyService _proxy = App.Services.GetRequiredService<ProxyService>();
        private readonly SyncService _sync = App.Services.GetRequiredService<SyncService>();

        public MainWindow()
        {
            InitializeComponent();
        }

        protected override async void OnSourceInitialized(EventArgs e)
        {
            base.OnSourceInitialized(e);

            IntPtr hwnd = new WindowInteropHelper(this).Handle;
            
            IntPtr exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);

            // Overlay Style
            IntPtr newStyle = new IntPtr((long)exStyle | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST);
            SetWindowLongPtr(hwnd, GWL_EXSTYLE, newStyle);

            var (status, body) = await _proxy.ForwardAsync("/posts/1", "GET", _sync);
            
            ////_knowledgeBase = new KnowledgeBase();
            ////_aiHintService = new AiHintService();

            //_checkTimer = new DispatcherTimer();
            //_checkTimer.Interval = TimeSpan.FromMilliseconds(500);
            //_checkTimer.Tick += CheckForDota2Process;
            //_checkTimer.Start();

            //_gameStateProvider = new GsiServer(); // new LogFileGameStateProvider()
            //_gameStateProvider.OnGameStateReceived += GsiServer_OnGameStateReceived;
            //_gameStateProvider.Start();
        }

        private void GsiServer_OnGameStateReceived(object sender, GameStateReceivedEventArgs e)
        {
            Dispatcher.Invoke(() => {
                HeroInfoTextBlock.Text = $"Hero: {e.GameState.Hero.Name}, Health: {e.GameState.Hero.HealthPercent}% \n GameTime {e.GameState.Map.GameTime}";
            });
        }

        // AI impl

        //private void GsiServer_OnGameStateReceived(object sender, GameStateReceivedEventArgs e)
        //{
        //    Dispatcher.Invoke(() =>
        //    {
        //        HeroInfoTextBlock.Text = "Loading...";
        //    });

        //    _ = Task.Run(async () =>
        //    {
        //        try
        //        {
        //            // Build context, Extract keywords
        //            var context = ContextBuilder.BuildContext(e.GameState);
        //            var keywords = ContextBuilder.ExtractKeywords(e.GameState);

        //            // Search knowledge base, Select Chunks
        //            var kbResults = _knowledgeBase.Search(keywords);
        //            var kbChunks = kbResults.Select(entry => entry.Content).ToArray();

        //            // Get hint from AI service
        //            var hint = await _aiHintService.GetHint(context, kbChunks);

        //            Dispatcher.Invoke(() =>
        //            {
        //                HeroInfoTextBlock.Text = hint;
        //            });
        //        }
        //        catch (Exception ex)
        //        {
        //            Dispatcher.Invoke(() =>
        //            {
        //                HeroInfoTextBlock.Text = $"Error: {ex.Message}";
        //            });
        //        }
        //    });
        //}

        private void CheckForDota2Process(object sender, EventArgs e)
        {
            Process[] processes = Process.GetProcessesByName("dota2");
            
            if (processes.Length > 0)
            {
                IntPtr windowHandle = FindWindowByProcessName("dota2");
                
                if (windowHandle != IntPtr.Zero && GetWindowRect(windowHandle, out RECT bounds))
                {
                    Debug.WriteLine($"Dota2 window found - Left: {bounds.Left}, Top: {bounds.Top}, Right: {bounds.Right}, Bottom: {bounds.Bottom}");
                }
            }
        }

        private IntPtr FindWindowByProcessName(string processName)
        {
            Process[] processes = Process.GetProcessesByName(processName);
            
            foreach (Process process in processes)
            {
                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    return process.MainWindowHandle;
                }
            }
            
            return IntPtr.Zero;
        }
    }
}