<?php
declare(strict_types=1);

$EM_CONF[$_EXTKEY] = [
    'title' => 'AstroTYPO3 Site',
    'description' => 'Site package for the AstroTYPO3 TYPO3 instance. Dispatches /api/content/v1 routes to the astro_builder controllers.',
    'category' => 'fe',
    'author' => 'Crayonweb Studio',
    'state' => 'stable',
    'version' => '1.0.0',
    'constraints' => [
        'depends' => [
            'typo3' => '13.4.0-13.4.99',
            'astro_builder' => '1.0.0-1.99.99',
        ],
        'conflicts' => [],
        'suggests' => [],
    ],
];
