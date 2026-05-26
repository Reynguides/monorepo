using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;

namespace Overlay_in_game_WPF
{
    public class AiHintService
    {
        private readonly HttpClient _httpClient;
        private readonly string _apiKey;
        private DateTime _lastCallTime = DateTime.MinValue;
        private const int CooldownSeconds = 60;

        public AiHintService()
        {
            _httpClient = new HttpClient();
            _apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY") ?? string.Empty;
        }

        public async Task<string> GetHint(string context, string[] kbChunks)
        {
            if (string.IsNullOrEmpty(_apiKey))
                throw new InvalidOperationException("GEMINI_API_KEY environment variable is not set.");

            var timeSinceLastCall = DateTime.UtcNow - _lastCallTime;
            if (timeSinceLastCall.TotalSeconds < CooldownSeconds)
            {
                return string.Empty;
            }

            var userMessage = context + "\n" + string.Join("\n", kbChunks);

            var requestBody = new
            {
                contents = new[]
                {
                    new
                    {
                        role = "user",
                        parts = new[]
                        {
                            new { text = userMessage }
                        }
                    }
                },
                systemInstruction = new
                {
                    parts = new[]
                    {
                        new { text = "You are a Dota 2 assistant. Answer in 1-2 sentences. Use only the provided context." }
                    }
                },
                generationConfig = new
                {
                    maxOutputTokens = 1024
                }
            };

            var jsonContent = JsonSerializer.Serialize(requestBody);
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={_apiKey}";

            int[] retryDelays = { 5, 15, 30 };

            for (int retryCount = 0; retryCount <= retryDelays.Length; retryCount++)
            {
                var httpContent = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json");
                var request = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = httpContent
                };

                var response = await _httpClient.SendAsync(request);

                if (response.StatusCode == HttpStatusCode.TooManyRequests && retryCount < retryDelays.Length)
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    Debug.WriteLine($"[AiHintService] HTTP 429 - Rate Limited. Response Body: {responseBody}");
                    await Task.Delay(retryDelays[retryCount] * 1000);
                    continue;
                }

                response.EnsureSuccessStatusCode();

                _lastCallTime = DateTime.UtcNow;

                var responseContent = await response.Content.ReadAsStringAsync();
                var jsonResponse = JsonDocument.Parse(responseContent);

                var textContent = jsonResponse.RootElement
                    .GetProperty("candidates")[0]
                    .GetProperty("content")
                    .GetProperty("parts")[0]
                    .GetProperty("text")
                    .GetString();

                return textContent ?? string.Empty;
            }

            throw new InvalidOperationException("Failed to get hint after all retry attempts.");
        }
    }
}
