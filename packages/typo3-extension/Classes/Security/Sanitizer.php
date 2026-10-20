<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Security;

final class Sanitizer
{
    private const ALLOWED_TAGS = '<p><strong><em><a><ul><ol><li><br><h3><h4><blockquote>';

    public function sanitizeRichText(string $html): string
    {
        $clean = strip_tags($html, self::ALLOWED_TAGS);
        $withoutHandlers = preg_replace('/\son\w+="[^"]*"/i', '', $clean);
        $clean = is_string($withoutHandlers) ? $withoutHandlers : $clean;
        $withoutJs = preg_replace('/href="javascript:[^"]*"/i', 'href="#"', $clean);
        return is_string($withoutJs) ? $withoutJs : $clean;
    }

    public function sanitizeUrl(string $url): string
    {
        $trimmed = trim($url);
        if ($trimmed === '') {
            return '';
        }
        if (str_starts_with($trimmed, '/') || str_starts_with($trimmed, '#')) {
            return $trimmed;
        }
        $scheme = strtolower((string)parse_url($trimmed, PHP_URL_SCHEME));
        return in_array($scheme, ['http', 'https', 'mailto'], true) ? $trimmed : '';
    }
}
