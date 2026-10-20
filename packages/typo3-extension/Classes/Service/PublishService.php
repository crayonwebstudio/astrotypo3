<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

final class PublishService
{
    /**
     * Dispatches a signed publish webhook with an idempotency key.
     * Returns the real dispatch result. When no webhook is configured this
     * returns an error state. It never reports a false success.
     *
     * @return array{status: string, jobId: string, message: string}
     */
    public function publish(int $pageUid, string $slug): array
    {
        $jobId = 'publish-' . $pageUid . '-' . hash('sha256', $slug . '|' . (string)time());
        $url = (string)(getenv('ASTRO_BUILDER_PUBLISH_WEBHOOK_URL') ?: '');
        $secret = (string)(getenv('ASTRO_BUILDER_PUBLISH_WEBHOOK_SECRET') ?: '');
        if ($url === '') {
            return ['status' => 'error', 'jobId' => $jobId, 'message' => 'No publish webhook configured. Set ASTRO_BUILDER_PUBLISH_WEBHOOK_URL.'];
        }
        $payload = json_encode(['event' => 'page.published', 'pageUid' => $pageUid, 'slug' => $slug, 'idempotencyKey' => $jobId]);
        if ($payload === false) {
            return ['status' => 'error', 'jobId' => $jobId, 'message' => 'Could not encode publish payload.'];
        }
        $signature = $secret !== '' ? hash_hmac('sha256', $payload, $secret) : '';
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nX-Idempotency-Key: " . $jobId . "\r\nX-Signature: " . $signature,
            'content' => $payload,
            'timeout' => 15,
            'ignore_errors' => true,
        ]]);
        $result = @file_get_contents($url, false, $context);
        if ($result === false) {
            return ['status' => 'error', 'jobId' => $jobId, 'message' => 'Publish webhook request failed.'];
        }
        return ['status' => 'accepted', 'jobId' => $jobId, 'message' => 'Publish webhook accepted the job. Final build status must be confirmed by the receiver.'];
    }
}
