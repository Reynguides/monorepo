using System.Diagnostics;
using Reyn.Application.Ingestion;

namespace Reyn.Infrastructure.Ingestion;

/// <summary>
/// Production <see cref="IGameDetector"/>: peeks at the Windows process
/// list for <c>bg3.exe</c> or <c>bg3_dx11.exe</c>. The hosted service
/// (<see cref="Bg3ProcessDetectorService"/>) calls this on a 2-second
/// cadence; the check is cheap (the OS keeps a process snapshot).
/// </summary>
public sealed class Bg3ProcessDetector : IGameDetector
{
    private static readonly string[] ProcessNames = { "bg3", "bg3_dx11" };

    public bool IsBg3Running()
    {
        foreach (var name in ProcessNames)
        {
            var processes = Process.GetProcessesByName(name);
            try
            {
                if (processes.Length > 0)
                {
                    return true;
                }
            }
            finally
            {
                foreach (var p in processes)
                {
                    p.Dispose();
                }
            }
        }
        return false;
    }
}
