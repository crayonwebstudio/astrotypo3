<?php
declare(strict_types=1);

return [
    'frontend' => [
        'crayonwebstudio/astrotypo3-site/api-dispatch' => [
            'target' => \Crayonwebstudio\AstroTypo3Site\Middleware\ApiDispatchMiddleware::class,
            'after' => [
                'typo3/cms-frontend/site',
                'crayonwebstudio/astro-builder/preview-auth',
            ],
        ],
    ],
];
