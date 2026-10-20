<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Controller;

use Crayonwebstudio\AstroBuilder\Service\ComponentRegistryService;
use Crayonwebstudio\AstroBuilder\Service\PageContentService;
use Crayonwebstudio\AstroBuilder\Service\PreviewTokenService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Http\JsonResponse;

/**
 * Versioned content API: /api/content/v1/*
 * Public actions return published content only. Draft access requires a
 * valid preview token and is a separate action on purpose.
 */
final class ContentApiController
{
    public function __construct(
        private readonly PageContentService $pageService,
        private readonly ComponentRegistryService $registryService,
        private readonly PreviewTokenService $previewTokenService,
    ) {
    }

    public function pageAction(ServerRequestInterface $request, string $slug): ResponseInterface
    {
        $page = $this->pageService->findPublishedBySlug($slug);
        if ($page === null) {
            return $this->error(404, 'not_found', 'Published page not found.');
        }
        return new JsonResponse($page->toArray());
    }

    public function draftAction(ServerRequestInterface $request, string $slug): ResponseInterface
    {
        // Tokens are scoped to the canonical (normalized) slug, so a token
        // minted for the root page "/" also validates for "home" and "".
        $slug = PageContentService::normalizeSlug($slug);
        $token = (string)($request->getHeaderLine('x-preview-token'));
        if ($token === '' || !$this->previewTokenService->verifyToken($token, $slug)) {
            return $this->error(401, 'unauthorized', 'A valid preview token is required for draft content.');
        }
        $page = $this->pageService->findDraftBySlug($slug);
        if ($page === null) {
            return $this->error(404, 'not_found', 'Draft page not found.');
        }
        return new JsonResponse($page->toArray());
    }

    public function registryAction(ServerRequestInterface $request): ResponseInterface
    {
        return new JsonResponse($this->registryService->getRegistry());
    }

    public function templatesAction(ServerRequestInterface $request): ResponseInterface
    {
        return new JsonResponse($this->registryService->getTemplates());
    }

    private function error(int $status, string $code, string $message): ResponseInterface
    {
        return new JsonResponse(['error' => ['code' => $code, 'message' => $message]], $status);
    }
}
