<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroTypo3Site\Middleware;

use Crayonwebstudio\AstroBuilder\Controller\ContentApiController;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Http\JsonResponse;

/**
 * Deployment glue for the AstroTYPO3 instance.
 *
 * The astro_builder extension exposes its content API through a public
 * controller service (ContentApiController) but, by design, registers no
 * frontend plugin and no routes: rendering belongs to Astro. This
 * middleware is the missing dispatch layer for this concrete site. It maps
 * the documented GET /api/content/v1 contract onto that controller and
 * passes every other request through to normal TYPO3 handling.
 *
 * The POST actions of BuilderApiController (builder/save, ai/generate,
 * publish) are intentionally NOT dispatched here: the extension expects
 * TYPO3 backend authentication and permission checks in the calling route
 * layer for those, and no such authenticated route layer exists in this
 * staging site yet.
 *
 * Draft requests are guarded earlier in the stack by the extension's own
 * PreviewAuthMiddleware (this middleware is registered after it), and the
 * draft controller action verifies the preview token again.
 */
final class ApiDispatchMiddleware implements MiddlewareInterface
{
    private const PREFIX = '/api/content/v1/';

    public function __construct(
        private readonly ContentApiController $contentApi,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = $this->requestPath($request);
        if (!str_starts_with($path, self::PREFIX)) {
            return $handler->handle($request);
        }
        $rest = substr($path, strlen(self::PREFIX));
        $method = strtoupper($request->getMethod());

        if ($method === 'GET' && $rest === 'registry') {
            return $this->contentApi->registryAction($request);
        }
        if ($method === 'GET' && $rest === 'templates') {
            return $this->contentApi->templatesAction($request);
        }
        if ($method === 'GET' && str_starts_with($rest, 'pages/')) {
            $slug = rawurldecode(substr($rest, strlen('pages/')));
            return $this->contentApi->pageAction($request, $slug);
        }
        if ($method === 'GET' && str_starts_with($rest, 'draft/')) {
            $slug = rawurldecode(substr($rest, strlen('draft/')));
            return $this->contentApi->draftAction($request, $slug);
        }
        return new JsonResponse(
            ['error' => ['code' => 'not_found', 'message' => 'Unknown API route.']],
            404
        );
    }

    /**
     * Prefer the raw request URI so percent encoded slugs (for example
     * %2F for the TYPO3 root page slug "/") survive until the slug segment
     * is decoded in process().
     */
    private function requestPath(ServerRequestInterface $request): string
    {
        $requestUri = (string)($request->getServerParams()['REQUEST_URI'] ?? '');
        if ($requestUri !== '') {
            $path = strtok($requestUri, '?');
            if (is_string($path) && $path !== '') {
                return $path;
            }
        }
        return $request->getUri()->getPath();
    }
}
