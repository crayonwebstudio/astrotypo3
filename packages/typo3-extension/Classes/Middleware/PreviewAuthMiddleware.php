<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Middleware;

use Crayonwebstudio\AstroBuilder\Service\PreviewTokenService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Http\JsonResponse;

/**
 * Guards draft preview paths. Requests to /api/content/v1/draft/* without a
 * valid preview token are rejected before they reach a controller.
 */
final class PreviewAuthMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly PreviewTokenService $previewTokenService)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = $request->getUri()->getPath();
        if (!str_contains($path, '/api/content/v1/draft/')) {
            return $handler->handle($request);
        }
        $slug = trim(substr($path, strrpos($path, '/') + 1));
        $token = $request->getHeaderLine('x-preview-token');
        if ($token === '' || !$this->previewTokenService->verifyToken($token, $slug)) {
            return new JsonResponse(['error' => ['code' => 'unauthorized', 'message' => 'A valid preview token is required.']], 401);
        }
        return $handler->handle($request);
    }
}
