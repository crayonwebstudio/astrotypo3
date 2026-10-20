<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Ai;

/**
 * Server side adapter for OpenAI compatible chat completion APIs.
 * The API key comes from the environment and is never sent to a browser.
 */
final class OpenAiCompatibleProvider implements AiProviderInterface
{
    public function __construct(
        private readonly string $baseUrl = 'https://api.openai.com/v1',
        private readonly string $model = 'gpt-4o-mini',
        private readonly int $timeoutSeconds = 30,
    ) {
    }

    public function getName(): string
    {
        return 'openai-compatible';
    }

    public function generateChangePlan(string $prompt, array $context): array
    {
        $apiKey = (string)(getenv('OPENAI_COMPATIBLE_API_KEY') ?: '');
        if ($apiKey === '') {
            throw new \RuntimeException('OPENAI_COMPATIBLE_API_KEY is not configured.');
        }
        $baseUrl = (string)(getenv('OPENAI_COMPATIBLE_BASE_URL') ?: $this->baseUrl);
        $payload = json_encode([
            'model' => $this->model,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => 'Return only a JSON change plan that follows the supplied schema. Never return code.'],
                ['role' => 'user', 'content' => json_encode(['prompt' => $prompt, 'context' => $context])],
            ],
        ]);
        if ($payload === false) {
            throw new \RuntimeException('Could not encode AI request.');
        }
        $lastError = '';
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $contextHttp = stream_context_create(['http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAuthorization: Bearer " . $apiKey,
                'content' => $payload,
                'timeout' => $this->timeoutSeconds,
                'ignore_errors' => true,
            ]]);
            $result = @file_get_contents(rtrim($baseUrl, '/') . '/chat/completions', false, $contextHttp);
            if ($result === false) {
                $lastError = 'AI provider request failed.';
                continue;
            }
            $decoded = json_decode($result, true);
            $content = '';
            if (is_array($decoded)) {
                $choices = $decoded['choices'] ?? [];
                if (is_array($choices) && isset($choices[0]['message']['content'])) {
                    $content = (string)$choices[0]['message']['content'];
                }
            }
            $plan = json_decode($content, true);
            if (is_array($plan)) {
                return ['provider' => $this->getName(), 'mock' => false, 'plan' => $plan];
            }
            $lastError = 'AI provider returned invalid JSON.';
        }
        throw new \RuntimeException($lastError !== '' ? $lastError : 'AI provider failed.');
    }
}
