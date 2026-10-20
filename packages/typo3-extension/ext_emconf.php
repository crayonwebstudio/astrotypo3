<?php
declare(strict_types=1);
$EM_CONF[$_EXTKEY] = [
    'title' => 'Astro Builder',
    'description' => 'AI powered visual website builder: TYPO3 content management with an Astro frontend.',
    'category' => 'plugin',
    'author' => 'Crayonweb Studio',
    'state' => 'beta',
    'version' => '0.1.0',
    'constraints' => [
        'depends' => ['typo3' => '13.4.0-13.4.99', 'php' => '8.2.0-8.4.99'],
        'conflicts' => [],
        'suggests' => [],
    ],
];
