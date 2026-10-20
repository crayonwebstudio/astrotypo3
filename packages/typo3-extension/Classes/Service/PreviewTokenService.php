<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

final class PreviewTokenService
{
    public function __construct(private readonly string $secret = '')
    {
    }

    public function createToken(string $slug, int $userId, int $ttlSeconds = 900): string
    {
        $expires = time() + max(60, $ttlSeconds);
        $payload = $slug . '.' . $userId . '.' . $expires;
        $signature = hash_hmac('sha256', $payload, $this->secret());
        return $this->base64UrlEncode($payload . '.' . $signature);
    }

    public function verifyToken(string $token, string $slug): bool
    {
        $decoded = $this->base64UrlDecode($token);
        if ($decoded === '') {
            return false;
        }
        $parts = explode('.', $decoded);
        if (count($parts) !== 4) {
            return false;
        }
        [$tokenSlug, $userId, $expires, $signature] = $parts;
        if (!hash_equals($slug, $tokenSlug)) {
            return false;
        }
        if ((int)$expires < time()) {
            return false;
        }
        $payload = $tokenSlug . '.' . $userId . '.' . $expires;
        $expected = hash_hmac('sha256', $payload, $this->secret());
        return hash_equals($expected, $signature);
    }

    private function secret(): string
    {
        if ($this->secret !== '') {
            return $this->secret;
        }
        $fromEnv = (string)(getenv('ASTRO_BUILDER_PREVIEW_SECRET') ?: '');
        return $fromEnv;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        $padded = strtr($value, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder > 0) {
            $padded .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode($padded, true);
        return $decoded === false ? '' : $decoded;
    }
}
