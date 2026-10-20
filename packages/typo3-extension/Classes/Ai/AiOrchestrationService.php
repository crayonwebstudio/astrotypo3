<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Ai;

use Crayonwebstudio\AstroBuilder\Service\ComponentRegistryService;

final class AiOrchestrationService
{
    /** @var null|callable(string): bool */
    private $permissionChecker = null;

    public function __construct(
        private readonly AiProviderInterface $provider,
        private readonly ChangePlanValidator $validator,
        private readonly ComponentRegistryService $registryService,
    ) {
    }

    /** @param callable(string): bool $checker */
    public function setPermissionChecker(callable $checker): void
    {
        $this->permissionChecker = $checker;
    }

    /**
     * Assembles context, calls the provider, validates the plan and checks
     * permission. It returns a reviewable result. Applying a plan is a
     * separate step done by normal content services after human review.
     *
     * @param array<string, mixed> $pageContext
     * @return array{status: string, provider: string, mock: bool, plan: array<string, mixed>|null, errors: list<string>, audit: array<string, mixed>}
     */
    public function propose(string $prompt, array $pageContext, string $permission = 'astro_builder:ai_generate'): array
    {
        if ($this->permissionChecker !== null && !($this->permissionChecker)($permission)) {
            return ['status' => 'forbidden', 'provider' => $this->provider->getName(), 'mock' => $this->provider->getName() === 'mock', 'plan' => null, 'errors' => ['Permission denied: ' . $permission], 'audit' => ['action' => 'ai.propose', 'result' => 'forbidden']];
        }
        $context = [
            'page' => $pageContext,
            'components' => array_map(static fn (array $component): string => (string)($component['id'] ?? ''), $this->registryService->getRegistry()['components'] ?? []),
            'allowedOps' => ChangePlanValidator::ALLOWED_OPS,
        ];
        try {
            $response = $this->provider->generateChangePlan($prompt, $context);
        } catch (\Throwable $exception) {
            return ['status' => 'error', 'provider' => $this->provider->getName(), 'mock' => false, 'plan' => null, 'errors' => [$exception->getMessage()], 'audit' => ['action' => 'ai.propose', 'result' => 'provider_error']];
        }
        $plan = $response['plan'] ?? null;
        if (!is_array($plan)) {
            return ['status' => 'error', 'provider' => $this->provider->getName(), 'mock' => (bool)($response['mock'] ?? false), 'plan' => null, 'errors' => ['Provider response did not contain a plan.'], 'audit' => ['action' => 'ai.propose', 'result' => 'invalid_plan']];
        }
        $errors = $this->validator->validate($plan);
        $status = $errors === [] ? 'ready_for_review' : 'invalid';
        return ['status' => $status, 'provider' => $this->provider->getName(), 'mock' => (bool)($response['mock'] ?? false), 'plan' => $plan, 'errors' => $errors, 'audit' => ['action' => 'ai.propose', 'result' => $status, 'operations' => count($plan['operations'] ?? [])]];
    }
}
