<?php
declare(strict_types=1);
return [
    'ctrl' => ['title' => 'tx_astrobuilder_element_type', 'label' => 'label', 'tstamp' => 'tstamp', 'crdate' => 'crdate', 'delete' => 'deleted', 'enablecolumns' => ['disabled' => 'hidden']],
    'types' => ['1' => ['showitem' => 'type_id, label, description, fields']],
    'columns' => [
        'type_id' => ['label' => 'type_id', 'config' => ['type' => 'input']],
        'label' => ['label' => 'label', 'config' => ['type' => 'input']],
        'description' => ['label' => 'description', 'config' => ['type' => 'text']],
        'fields' => ['label' => 'fields (JSON)', 'config' => ['type' => 'text']],
    ],
];
