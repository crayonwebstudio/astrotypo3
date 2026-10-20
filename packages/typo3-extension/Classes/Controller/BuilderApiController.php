<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Controller;

use Crayonwebstudio\AstroBuilder\Ai\AiOrchestrationService;
use Crayonwebstudio\AstroBuilder\Domain\Model\Element;
use Crayonwebstudio\AstroBuilder\Domain\Model\Page;
use Crayonwebstudio\AstroBuilder\Service\ContentElementMapper;
use Crayonwebstudio\AstroBuilder\Service\PageContentService;
use Crayonwebstudio\AstroBuilder\Service\PublishService;
use Crayonwebstudio\AstroBuilder\Service\ValidationService;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Http\JsonResponse;

/**
 * Builder, AI and publishing actions. Every action expects TYPO3 backend
 * authentication and permission checks in the calling route configuration.
 * This controller validates all input again server side.
 */
final class BuilderApiController
{
    public function __construct(
        private readonly ValidationService $validationService,
        private readonly AiOrchestrationService $aiService,
        private readonly PublishService $publishService,
        private readonly ContentElementMapper $elementMapper,
        private readonly PageContentService $pageContentService,
    ) {
    }

    public function saveAction(ServerRequestInterface $request): ResponseInterface
    {
        $body = $this->jsonBody($request);
        $pageData = $body['page'] ?? null;
        if (!is_array($pageData)) {
            return new JsonResponse(['error' => ['code' => 'invalid_request', 'message' => 'page is required.']], 422);
        }
        $elements = [];
        foreach (($pageData['elements'] ?? []) as $elementData) {
            if (is_array($elementData)) {
                $elements[] = Element::fromArray($elementData);
            }
        }
        $seo = $pageData['seo'] ?? [];
        $page = new Page(
            (string)($pageData['id'] ?? ''),
            (string)($pageData['slug'] ?? ''),
            (string)($pageData['title'] ?? ''),
            'draft',
            $elements,
            is_array($seo) ? $seo : [],
            (string)($pageData['locale'] ?? 'en'),
        );
        $errors = $this->validationService->validatePage($page);
        if ($errors !== []) {
            return new JsonResponse(['error' => ['code' => 'validation_failed', 'message' => 'The page did not validate.', 'details' => $errors]], 422);
        }
        $pageUid = $this->resolvePageUid($page);
        if ($pageUid <= 0) {
            return new JsonResponse(['error' => ['code' => 'not_found', 'message' => 'The TYPO3 page for this payload was not found.']], 404);
        }
        // Persistence goes through DataHandler (ContentElementMapper), so
        // TCA validation, permissions, workspaces and revisions stay native.
        // Elements become tt_content core elements of the page; records the
        // builder previously created and that are missing from this payload
        // are deleted, records created outside the builder are never touched.
        try {
            $this->elementMapper->persistPageElements($pageUid, $elements);
        } catch (\Throwable $exception) {
            return new JsonResponse(['error' => ['code' => 'persistence_failed', 'message' => $exception->getMessage()]], 500);
        }
        $saved = $this->pageContentService->findDraftBySlug($page->slug);
        return new JsonResponse([
            'status' => 'saved',
            'page' => $saved !== null ? $saved->toArray() : $page->toArray(),
            'note' => 'Saved as tt_content core elements through DataHandler.',
        ]);
    }

    private function resolvePageUid(Page $page): int
    {
        if (str_starts_with($page->id, 'page-')) {
            $uid = (int)substr($page->id, strlen('page-'));
            if ($uid > 0) {
                return $uid;
            }
        }
        try {
            $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
            $queryBuilder = $connectionPool->getQueryBuilderForTable('pages');
            // A save must also find hidden (not yet launched) pages; the
            // default restriction container would silently exclude them.
            $queryBuilder->getRestrictions()->removeAll()
                ->add(GeneralUtility::makeInstance(\TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction::class));
            $row = $queryBuilder->select('uid')->from('pages')
                ->where($queryBuilder->expr()->eq('slug', $queryBuilder->createNamedParameter(PageContentService::normalizeSlug($page->slug))))
                ->andWhere($queryBuilder->expr()->eq('deleted', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)))
                ->executeQuery()->fetchAssociative();
            return is_array($row) ? (int)$row['uid'] : 0;
        } catch (\Throwable) {
            return 0;
        }
    }

    public function aiGenerateAction(ServerRequestInterface $request): ResponseInterface
    {
        $body = $this->jsonBody($request);
        $prompt = trim((string)($body['prompt'] ?? ''));
        if ($prompt === '') {
            return new JsonResponse(['error' => ['code' => 'invalid_request', 'message' => 'prompt is required.']], 422);
        }
        $pageContext = $body['page'] ?? [];
        $result = $this->aiService->propose($prompt, is_array($pageContext) ? $pageContext : []);
        $status = $result['status'] === 'forbidden' ? 403 : 200;
        return new JsonResponse($result, $status);
    }

    public function publishAction(ServerRequestInterface $request): ResponseInterface
    {
        $body = $this->jsonBody($request);
        $pageUid = (int)($body['pageUid'] ?? 0);
        $slug = (string)($body['slug'] ?? '');
        if ($pageUid <= 0 || $slug === '') {
            return new JsonResponse(['error' => ['code' => 'invalid_request', 'message' => 'pageUid and slug are required.']], 422);
        }
        $result = $this->publishService->publish($pageUid, $slug);
        return new JsonResponse($result, $result['status'] === 'error' ? 502 : 202);
    }

    /** @return array<string, mixed> */
    private function jsonBody(ServerRequestInterface $request): array
    {
        $parsed = $request->getParsedBody();
        if (is_array($parsed)) {
            return $parsed;
        }
        $raw = (string)$request->getBody();
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }
}
