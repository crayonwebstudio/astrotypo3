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
        // The environment variable wins so a site can point the extension at
        // its own copy of the shared contract. Without it, the path configured
        // in Services.yaml is used: the contract copy bundled with the
        // extension under Resources/Private/Contract.
        $fromEnv = trim((string)(getenv('ASTRO_BUILDER_SHARED_CONTRACT_PATH') ?: ''));
        if ($fromEnv !== '') {
            return rtrim($fromEnv, '/') . '/' . $file;
        }
        $configured = trim($this->sharedContractPath);
        if ($configured === '') {
            return '';
        }
        if (str_starts_with($configured, '/')) {
            return rtrim($configured, '/') . '/' . $file;
        }
        // Relative paths are resolved against the extension root, which is
        // two levels up from Classes/Service.
        $extensionRoot = dirname(__DIR__, 2);
        return $extensionRoot . '/' . trim($configured, '/') . '/' . $file;
    }
}
