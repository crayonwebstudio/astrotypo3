<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Middleware;

use Crayonwebstudio\AstroBuilder\Controller\BuilderApiController;
use Crayonwebstudio\AstroBuilder\Controller\ContentApiController;
use Crayonwebstudio\AstroBuilder\Controller\ElementTypeApiController;
use Crayonwebstudio\AstroBuilder\Service\PreviewTokenService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Http\JsonResponse;

/**
 * HTTP entry point for the astro_builder API.
 *
 * Registered in the frontend stack before typo3/cms-frontend/page-resolver
 * and typo3/cms-frontend/base-redirect-resolver, because those middlewares
 * answer unknown /api paths with the TYPO3 HTML 404 page before any
 * controller could run. This middleware intercepts exactly the API paths
 * below and dispatches to the controllers; every other request passes
 * through untouched.
 *
 *   GET  /api/content/v1/pages/{slug}     published page (slug may contain
 *                                         slashes, remainder of the path)
 *   GET  /api/content/v1/draft/{slug}     draft page, preview token checked
 *                                         by PreviewAuthMiddleware and again
 *                                         by the controller
 *   GET  /api/content/v1/registry         component registry
 *   GET  /api/content/v1/templates        template library
 *   GET  /api/v1/element-types            core + custom element types
 *   POST /api/v1/element-types            create element type (token scope
 *                                         "element-types", checked by the
 *                                         controller)
 *   POST /api/builder/v1/save             builder save, requires a preview
 *                                         token for the page slug in the
 *                                         JSON body
 */
final class ApiMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly ContentApiController $contentController,
        private readonly BuilderApiController $builderController,
        private readonly ElementTypeApiController $elementTypeController,
        private readonly PreviewTokenService $previewTokenService,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = $request->getUri()->getPath();
        $method = strtoupper($request->getMethod());

        if (str_starts_with($path, '/api/content/v1/pages/')) {
            if ($method !== 'GET') {
                return $this->methodNotAllowed();
            }
            $slug = $this->slugAfterPrefix($path, '/api/content/v1/pages/');
            return $this->contentController->pageAction($request, $slug);
        }
        if (str_starts_with($path, '/api/content/v1/draft/')) {
            if ($method !== 'GET') {
                return $this->methodNotAllowed();
            }
            $slug = $this->slugAfterPrefix($path, '/api/content/v1/draft/');
            return $this->contentController->draftAction($request, $slug);
        }
        if ($path === '/api/content/v1/registry') {
            if ($method !== 'GET') {
                return $this->methodNotAllowed();
            }
            return $this->contentController->registryAction($request);
        }
        if ($path === '/api/content/v1/templates') {
            if ($method !== 'GET') {
                return $this->methodNotAllowed();
            }
            return $this->contentController->templatesAction($request);
        }
        if ($path === '/api/v1/element-types') {
            return match ($method) {
                'GET' => $this->elementTypeController->listAction($request),
                'POST' => $this->elementTypeController->createAction($request),
                default => $this->methodNotAllowed(),
            };
        }
        if ($path === '/api/builder/v1/save') {
            if ($method !== 'POST') {
                return $this->methodNotAllowed();
            }
            return $this->builderSave($request);
        }
        return $handler->handle($request);
    }

    /**
     * Builder saves write real tt_content records, so they require a valid
     * preview token for the slug of the page being saved. The token check
     * reuses PreviewTokenService; the controller validates the payload again.
     */
    private function builderSave(ServerRequestInterface $request): ResponseInterface
    {
        $body = json_decode((string)$request->getBody(), true);
        $slug = is_array($body) && is_array($body['page'] ?? null) ? (string)($body['page']['slug'] ?? '') : '';
        $token = $request->getHeaderLine('x-preview-token');
        if ($slug === '' || $token === '' || !$this->previewTokenService->verifyToken($token, $slug)) {
            return new JsonResponse(['error' => ['code' => 'unauthorized', 'message' => 'A valid preview token for the page slug is required to save.']], 401);
        }
        // The body stream was consumed above; hand the controller a request
        // whose parsed body already carries the payload.
        $request = $request->withParsedBody($body);
        return $this->builderController->saveAction($request);
    }

    private function slugAfterPrefix(string $path, string $prefix): string
    {
        return urldecode(substr($path, strlen($prefix)));
    }

    private function methodNotAllowed(): ResponseInterface
    {
        return new JsonResponse(['error' => ['code' => 'method_not_allowed', 'message' => 'Method not allowed for this API path.']], 405);
    }
}
