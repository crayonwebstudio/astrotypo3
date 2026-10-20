<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Ai;

use Crayonwebstudio\AstroBuilder\Domain\Model\Element;
use Crayonwebstudio\AstroBuilder\Service\ValidationService;

final class ChangePlanValidator
{
    public const ALLOWED_OPS = [
        'create_page', 'update_page_metadata', 'add_element', 'update_element_props',
        'move_element', 'duplicate_element', 'remove_element', 'apply_section_template',
        'apply_page_template', 'suggest_seo', 'generate_image_request',
    ];
    public const FORBIDDEN_OPS = ['publish_page', 'delete_page', 'change_permissions', 'execute_code', 'run_sql'];

    public function __construct(private readonly ValidationService $validationService)
    {
    }

    /**
     * @param array<string, mixed> $plan
     * @return list<string>
     */
    public function validate(array $plan, bool $allowDestructive = false): array
    {
        $errors = [];
        $operations = $plan['operations'] ?? null;
        if (!is_array($operations)) {
            return ['plan.operations: must be an array'];
        }
        foreach ($operations as $index => $operation) {
            $path = 'operations[' . $index . ']';
            if (!is_array($operation) || !isset($operation['type'])) {
                $errors[] = $path . ': type is required';
                continue;
            }
            $type = (string)$operation['type'];
            if (in_array($type, self::FORBIDDEN_OPS, true)) {
                $errors[] = $path . ': operation ' . $type . ' is forbidden in AI change plans';
                continue;
            }
            if (!in_array($type, self::ALLOWED_OPS, true)) {
                $errors[] = $path . ': operation ' . $type . ' is not allowlisted';
                continue;
            }
            if ($type === 'remove_element' && !$allowDestructive) {
                $errors[] = $path . ': remove_element requires explicit destructive approval';
            }
            if ($type === 'add_element' && isset($operation['element']) && is_array($operation['element'])) {
                foreach ($this->validationService->validateElement(Element::fromArray($operation['element']), $path . '.element') as $error) {
                    $errors[] = $error;
                }
            }
        }
        return $errors;
    }
}
