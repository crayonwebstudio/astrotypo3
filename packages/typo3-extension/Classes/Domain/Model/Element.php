<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Domain\Model;

final class Element
{
    /** @param array<string, mixed> $props @param list<Element> $children */
    public function __construct(
        public readonly string $id,
        public readonly string $componentId,
        public readonly array $props = [],
        public readonly array $children = [],
    ) {
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        $data = ['id' => $this->id, 'componentId' => $this->componentId, 'props' => $this->props];
        if ($this->children !== []) {
            $data['children'] = array_map(static fn (Element $child): array => $child->toArray(), $this->children);
        }
        return $data;
    }

    /** @param array<string, mixed> $data */
    public static function fromArray(array $data): self
    {
        $children = [];
        foreach (($data['children'] ?? []) as $child) {
            if (is_array($child)) {
                $children[] = self::fromArray($child);
            }
        }
        $props = $data['props'] ?? [];
        return new self(
            (string)($data['id'] ?? ''),
            (string)($data['componentId'] ?? ''),
            is_array($props) ? $props : [],
            $children,
        );
    }
}
