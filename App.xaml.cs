using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Configuration;
using System.Data;
using System.Windows;

namespace Overlay_in_game_WPF
{
    public partial class App : Application
    {
        public static IServiceProvider Services { get; private set; } = null!;

        protected override void OnStartup(StartupEventArgs e)
        {
            var collection = new ServiceCollection();

            collection.AddDbContext<AppDbContext>(o =>
                o.UseSqlite("Data Source=proxy.db"));

            collection.AddHttpClient<ProxyService>();
            collection.AddHttpClient<SyncService>();

            Services = collection.BuildServiceProvider();

            // TODO:
            // replace EnsureCreated() with Migrate() for migrations
            using var scope = Services.CreateScope();
            scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();

            base.OnStartup(e);
        }
    }

}
