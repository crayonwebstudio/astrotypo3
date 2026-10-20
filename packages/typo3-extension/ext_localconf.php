<?php
declare(strict_types=1);
defined('TYPO3') or die();
// The content, element type and builder APIs are served by the ApiMiddleware
// in the frontend stack (Configuration/RequestMiddlewares.php), which
// intercepts /api/* paths before the page resolver and dispatches to the
// API controllers. No frontend plugin is registered on purpose: rendering
// is done by Astro.
