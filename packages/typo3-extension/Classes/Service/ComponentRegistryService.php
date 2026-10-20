<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

final class ComponentRegistryService
{
    /** @var array<string, mixed>|null */
    private ?array $registry = null;

    public function __construct(private readonly string $sharedContractPath = '')
    {
    }

    /** @return array<string, mixed> */
    public function getRegistry(): array
    {
        if ($this->registry !== null) {
            return $this->registry;
        }
        $path = $this->resolvePath('registry.json');
        if ($path === '' || !is_file($path)) {
            $this->registry = ['contractVersion' => '1.0.0', 'components' => []];
            return $this->registry;
        }
        $decoded = json_decode((string)file_get_contents($path), true);
        $this->registry = is_array($decoded) ? $decoded : ['contractVersion' => '1.0.0', 'components' => []];
        return $this->registry;
    }

    /** @return array<string, mixed>|null */
    public function getComponent(string $componentId): ?array
    {
        foreach ($this->getRegistry()['components'] ?? [] as $component) {
            if (is_array($component) && ($component['id'] ?? '') === $componentId) {
                return $component;
            }
        }
        return null;
    }

    /** @return array<string, mixed> */
    public function getTemplates(): array
    {
        $path = $this->resolvePath('templates.json');
        if ($path === '' || !is_file($path)) {
            return [];
        }
        $decoded = json_decode((string)file_get_contents($path), true);
        return is_array($decoded) ? $decoded : [];
    }

    private function resolvePath(string $file): string
    {
        $configured = trim($this->sharedContractPath);
        if ($configured !== '') {
            return rtrim($configured, '/') . '/' . $file;
        }
        $fromEnv = (string)(getenv('ASTRO_BUILDER_SHARED_CONTRACT_PATH') ?: '');
        if ($fromEnv !== '') {
            return rtrim($fromEnv, '/') . '/' . $file;
        }
        return '';
    }
}
