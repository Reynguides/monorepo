using Microsoft.Extensions.DependencyInjection;
using Reyn.Infrastructure.Http;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace Reyn.Desktop;

public partial class MainWindow
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_LAYERED = 0x80000;
    private const int WS_EX_TRANSPARENT = 0x20;
    private const int WS_EX_TOPMOST = 0x00000008;

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    private readonly ProxyService _proxy = App.Services.GetRequiredService<ProxyService>();
    private readonly SyncService _sync = App.Services.GetRequiredService<SyncService>();

    public MainWindow()
    {
        InitializeComponent();
    }

    protected override async void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);

        var hwnd = new WindowInteropHelper(this).Handle;
        var exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
        var newStyle = new IntPtr((long)exStyle | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST);
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, newStyle);

        await _proxy.ForwardAsync("/posts/1", "GET", _sync).ConfigureAwait(false);
    }
}
