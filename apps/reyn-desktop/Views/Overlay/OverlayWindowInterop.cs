using System.Diagnostics.CodeAnalysis;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace Reyn.Desktop.Views.Overlay;

/// <summary>
/// Win32 plumbing for the click-through topmost overlay. Lives outside
/// <c>OverlayWindow</c> so the XAML class itself stays trivial and the
/// P/Invoke surface is in one place we can exclude from coverage.
/// </summary>
[ExcludeFromCodeCoverage]
internal static class OverlayWindowInterop
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_LAYERED = 0x80000;
    private const int WS_EX_TRANSPARENT = 0x20;
    private const int WS_EX_TOPMOST = 0x00000008;

    /// <summary>
    /// Marks the given WPF window as click-through (mouse passes through to
    /// whatever is underneath, e.g. BG3) + topmost + layered. Called from
    /// <c>OverlayWindow.OnSourceInitialized</c> once HWND exists.
    /// </summary>
    public static void MakeClickThroughTopmost(Window window)
    {
        var hwnd = new WindowInteropHelper(window).Handle;
        var exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
        var newStyle = new IntPtr((long)exStyle | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST);
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, newStyle);
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
}
