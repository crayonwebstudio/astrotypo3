<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Controller;

use Crayonwebstudio\AstroBuilder\Service\ElementTypeRegistryService;
use Crayonwebstudio\AstroBuilder\Service\PreviewTokenService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Http\JsonResponse;

/**
 * Element type API for the external builder: /api/v1/element-types
 * Reads list the core registry types plus API created custom types.
 * Creating a type requires a preview token issued for the scope
 * "element-types" (same PreviewTokenService as draft previews).
 */
final class ElementTypeApiController
{
    public const TOKEN_SCOPE = 'element-types';

    public function __construct(
        private readonly ElementTypeRegistryService $typeRegistry,
        private readonly PreviewTokenService $previewTokenService,
    ) {
    }

    public function listAction(ServerRequestInterface $request): ResponseInterface
    {
        return new JsonResponse(['types' => $this->typeRegistry->listTypes()]);
    }

    public function createAction(ServerRequestInterface $request): ResponseInterface
    {
        $token = $request->getHeaderLine('x-preview-token');
        if ($token === '' || !$this->previewTokenService->verifyToken($token, self::TOKEN_SCOPE)) {
            return new JsonResponse(['error' => ['code' => 'unauthorized', 'message' => 'A valid token for the element-types scope is required.']], 401);
        }
        $body = $this->jsonBody($request);
        $errors = $this->typeRegistry->validateType($body);
        if ($errors !== []) {
            return new JsonResponse(['error' => ['code' => 'validation_failed', 'message' => 'The element type did not validate.', 'details' => $errors]], 422);
        }
        $type = $this->typeRegistry->createType($body);
        return new JsonResponse(['type' => $type], 201);
    }

    /** @return array<string, mixed> */
    private function jsonBody(ServerRequestInterface $request): array
    {
        $parsed = $request->getParsedBody();
        if (is_array($parsed)) {
            return $parsed;
        }
        $decoded = json_decode((string)$request->getBody(), true);
        return is_array($decoded) ? $decoded : [];
    }
}
