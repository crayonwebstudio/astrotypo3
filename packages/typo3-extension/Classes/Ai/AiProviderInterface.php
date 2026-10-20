<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Ai;

interface AiProviderInterface
{
    public function getName(): string;

    /**
     * @param array<string, mixed> $context
     * @return array<string, mixed> Decoded structured response, expected to contain a change plan.
     */
    public function generateChangePlan(string $prompt, array $context): array;
}
