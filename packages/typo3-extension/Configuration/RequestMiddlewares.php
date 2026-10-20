<?php
declare(strict_types=1);
return [
    'frontend' => [
        'crayonwebstudio/astro-builder/preview-auth' => [
            'target' => \Crayonwebstudio\AstroBuilder\Middleware\PreviewAuthMiddleware::class,
            'after' => ['typo3/cms-frontend/site'],
        ],
    ],
];
