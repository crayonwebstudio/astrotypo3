<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

use Crayonwebstudio\AstroBuilder\Domain\Model\Element;
use Crayonwebstudio\AstroBuilder\Domain\Model\Page;

final class ValidationService
{
    public function __construct(private readonly ComponentRegistryService $registryService)
    {
    }

    /** @return list<string> */
    public function validatePage(Page $page): array
    {
        $errors = [];
        if ($page->id === '') {
            $errors[] = 'page.id: required';
        }
        if ($page->slug === '') {
            $errors[] = 'page.slug: required';
        }
        if (!in_array($page->status, ['published', 'draft'], true)) {
            $errors[] = 'page.status: must be published or draft';
        }
        foreach ($page->elements as $index => $element) {
            foreach ($this->validateElement($element, 'elements[' . $index . ']') as $error) {
                $errors[] = $error;
            }
        }
        return $errors;
    }

    /** @return list<string> */
    public function validateElement(Element $element, string $path = 'element'): array
    {
        $errors = [];
        $definition = $this->registryService->getComponent($element->componentId);
        if ($definition === null) {
            return [$path . ': unknown componentId ' . $element->componentId];
        }
        $propDefs = $definition['props'] ?? [];
        if (is_array($propDefs)) {
            foreach ($propDefs as $key => $spec) {
                if (!is_array($spec)) {
                    continue;
                }
                if (!array_key_exists($key, $element->props)) {
                    if (($spec['required'] ?? false) === true) {
                        $errors[] = $path . '.props.' . $key . ': required prop missing';
                    }
                    continue;
                }
                $value = $element->props[$key];
                $type = (string)($spec['type'] ?? 'string');
                if ($type === 'enum') {
                    $values = $spec['values'] ?? [];
                    if (!is_array($values) || !in_array($value, $values, true)) {
                        $errors[] = $path . '.props.' . $key . ': invalid enum value';
                    }
                } elseif (!$this->typeMatches($value, $type)) {
                    $errors[] = $path . '.props.' . $key . ': expected ' . $type;
                }
            }
            foreach (array_keys($element->props) as $key) {
                if (!array_key_exists($key, $propDefs)) {
                    $errors[] = $path . '.props.' . $key . ': unknown prop for ' . $element->componentId;
                }
            }
        }
        $allowedChildren = $definition['childrenAllowed'] ?? [];
        foreach ($element->children as $index => $child) {
            if (is_array($allowedChildren) && $allowedChildren !== [] && !in_array($child->componentId, $allowedChildren, true)) {
                $errors[] = $path . '.children[' . $index . ']: ' . $child->componentId . ' is not allowed inside ' . $element->componentId;
            }
            foreach ($this->validateElement($child, $path . '.children[' . $index . ']') as $error) {
                $errors[] = $error;
            }
        }
        return $errors;
    }

    private function typeMatches(mixed $value, string $type): bool
    {
        return match ($type) {
            'string' => is_string($value),
            'number' => is_int($value) || is_float($value),
            'boolean' => is_bool($value),
            'array' => is_array($value),
            'object' => is_array($value),
            default => true,
        };
    }
}
