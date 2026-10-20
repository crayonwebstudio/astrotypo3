<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Domain\Model;

final class Page
{
    /** @param list<Element> $elements @param array<string, string> $seo */
    public function __construct(
        public readonly string $id,
        public readonly string $slug,
        public readonly string $title,
        public readonly string $status,
        public readonly array $elements = [],
        public readonly array $seo = [],
        public readonly string $locale = 'en',
    ) {
    }

    public function isPublished(): bool
    {
        return $this->status === 'published';
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'title' => $this->title,
            'status' => $this->status,
            'locale' => $this->locale,
            'seo' => $this->seo,
            'elements' => array_map(static fn (Element $element): array => $element->toArray(), $this->elements),
        ];
    }
}
