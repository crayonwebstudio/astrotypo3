<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * Element types for the external builder. The 15 core types come from the
 * shared registry; custom types created through the API are persisted in
 * tx_astrobuilder_element_type and use the same CType convention:
 * astro_builder_<type id with dots and dashes replaced by underscores>.
 *
 * Creating a type writes the registry row immediately, so API reads include
 * it at once. The CType becomes selectable in the TYPO3 backend element
 * wizard only after a cache flush, because TCA is built at bootstrap from
 * the rows present at that time (Configuration/TCA/Overrides/tt_content.php).
 */
final class ElementTypeRegistryService
{
    /** Field types a custom element type may declare. */
    public const ALLOWED_FIELD_TYPES = ['string', 'text', 'number', 'boolean', 'enum', 'image', 'link', 'array', 'object'];

    public function __construct(private readonly ComponentRegistryService $registryService)
    {
    }

    public function ctypeForTypeId(string $typeId): string
    {
        return 'astro_builder_' . str_replace(['.', '-'], '_', $typeId);
    }

    /** @return list<array<string, mixed>> */
    public function listTypes(): array
    {
        $types = [];
        foreach ($this->registryService->getRegistry()['components'] ?? [] as $component) {
            if (!is_array($component) || !isset($component['id'])) {
                continue;
            }
            $fields = [];
            foreach (($component['props'] ?? []) as $name => $spec) {
                $fields[] = ['name' => (string)$name, 'type' => is_array($spec) ? (string)($spec['type'] ?? 'string') : 'string'];
            }
            $types[] = [
                'id' => (string)$component['id'],
                'label' => (string)($component['label'] ?? $component['id']),
                'ctype' => (string)($component['typo3Ctype'] ?? $this->ctypeForTypeId((string)$component['id'])),
                'source' => 'core',
                'fields' => $fields,
            ];
        }
        foreach ($this->customTypeRows() as $row) {
            $fields = json_decode((string)($row['fields'] ?? ''), true);
            $types[] = [
                'id' => (string)$row['type_id'],
                'label' => (string)($row['label'] ?? $row['type_id']),
                'description' => (string)($row['description'] ?? ''),
                'ctype' => $this->ctypeForTypeId((string)$row['type_id']),
                'source' => 'custom',
                'fields' => is_array($fields) ? $fields : [],
            ];
        }
        return $types;
    }

    /** @return array<string, mixed>|null */
    public function findType(string $typeId): ?array
    {
        foreach ($this->listTypes() as $type) {
            if ($type['id'] === $typeId) {
                return $type;
            }
        }
        return null;
    }

    /**
     * Validate a create payload without writing anything.
     *
     * @param array<string, mixed> $data
     * @return list<string>
     */
    public function validateType(array $data): array
    {
        $errors = [];
        $id = (string)($data['id'] ?? '');
        if (!preg_match('/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/', $id)) {
            $errors[] = 'id: must be a dotted lowercase identifier, for example custom.testimonial-card';
        } elseif ($this->findType($id) !== null) {
            $errors[] = 'id: an element type with this id already exists';
        }
        if (trim((string)($data['label'] ?? '')) === '') {
            $errors[] = 'label: required';
        }
        $fields = $data['fields'] ?? [];
        if (!is_array($fields)) {
            $errors[] = 'fields: must be a list';
            return $errors;
        }
        foreach ($fields as $index => $field) {
            if (!is_array($field)) {
                $errors[] = 'fields[' . $index . ']: must be an object with name and type';
                continue;
            }
            if (!preg_match('/^[a-z][a-zA-Z0-9]*$/', (string)($field['name'] ?? ''))) {
                $errors[] = 'fields[' . $index . '].name: must start with a lowercase letter and contain only letters and digits';
            }
            if (!in_array((string)($field['type'] ?? ''), self::ALLOWED_FIELD_TYPES, true)) {
                $errors[] = 'fields[' . $index . '].type: must be one of ' . implode(', ', self::ALLOWED_FIELD_TYPES);
            }
        }
        return $errors;
    }

    /**
     * @param array<string, mixed> $data payload already passed validateType()
     * @return array<string, mixed> the created type
     */
    public function createType(array $data): array
    {
        $fields = [];
        foreach (($data['fields'] ?? []) as $field) {
            if (is_array($field)) {
                $fields[] = ['name' => (string)$field['name'], 'type' => (string)$field['type']];
            }
        }
        $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
        $connection = $connectionPool->getConnectionForTable('tx_astrobuilder_element_type');
        $connection->insert('tx_astrobuilder_element_type', [
            'pid' => 0,
            'type_id' => (string)$data['id'],
            'label' => (string)$data['label'],
            'description' => (string)($data['description'] ?? ''),
            'fields' => json_encode($fields),
            'crdate' => time(),
            'tstamp' => time(),
        ]);
        return [
            'id' => (string)$data['id'],
            'label' => (string)$data['label'],
            'description' => (string)($data['description'] ?? ''),
            'ctype' => $this->ctypeForTypeId((string)$data['id']),
            'source' => 'custom',
            'fields' => $fields,
            'note' => 'Type registered. A TYPO3 cache flush is required before the CType appears in the backend element wizard; the API lists it immediately.',
        ];
    }

    /** @return list<array<string, mixed>> */
    private function customTypeRows(): array
    {
        try {
            $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
            $connection = $connectionPool->getConnectionForTable('tx_astrobuilder_element_type');
            $rows = $connection->select(['type_id', 'label', 'description', 'fields'], 'tx_astrobuilder_element_type', ['deleted' => 0, 'hidden' => 0])->fetchAllAssociative();
            return is_array($rows) ? $rows : [];
        } catch (\Throwable) {
            return [];
        }
    }
}
