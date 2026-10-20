<?php
declare(strict_types=1);
return [
    'frontend' => [
        'crayonwebstudio/astro-builder/preview-auth' => [
            'target' => \Crayonwebstudio\AstroBuilder\Middleware\PreviewAuthMiddleware::class,
            'after' => ['typo3/cms-frontend/site'],
        ],
        // The API middleware must answer /api/* paths before the page
        // resolver and the base redirect resolver turn them into the TYPO3
        // HTML 404 page. In the resolved stack, "before" entries execute
        // earlier; the position was verified against the resolved frontend
        // stack of a TYPO3 13.4 instance (see docs/TYPO3_API_VERIFICATION.md).
        'crayonwebstudio/astro-builder/api' => [
            'target' => \Crayonwebstudio\AstroBuilder\Middleware\ApiMiddleware::class,
            'before' => [
                'typo3/cms-frontend/page-resolver',
                'typo3/cms-frontend/base-redirect-resolver',
            ],
            'after' => ['typo3/cms-frontend/site'],
        ],
    ],
];
