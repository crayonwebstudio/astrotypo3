<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Controller;

use Crayonwebstudio\AstroBuilder\Ai\AiOrchestrationService;
use Crayonwebstudio\AstroBuilder\Domain\Model\Element;
use Crayonwebstudio\AstroBuilder\Domain\Model\Page;
use Crayonwebstudio\AstroBuilder\Service\PublishService;
use Crayonwebstudio\AstroBuilder\Service\ValidationService;
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
        // Persistence is done through TYPO3 DataHandler in the site package so
        // revisions, workspaces and permissions stay native. This controller
        // returns the validated draft for that step.
        return new JsonResponse(['status' => 'validated', 'page' => $page->toArray(), 'note' => 'Validated draft. Persist through DataHandler in the site integration.']);
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
