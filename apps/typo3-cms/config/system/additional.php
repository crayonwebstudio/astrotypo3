<?php
declare(strict_types=1);

// Additional configuration for the AstroTYPO3 staging instance.
// Loaded after config/system/settings.php on every request.

// The instance sits behind the Coolify reverse proxy (Traefik), which
// terminates TLS and forwards plain HTTP to this container.
$GLOBALS['TYPO3_CONF_VARS']['SYS']['reverseProxyIP'] = '*';
$GLOBALS['TYPO3_CONF_VARS']['SYS']['reverseProxyHeaderMultiValue'] = 'first';

// Accept the public staging host plus local in-container checks.
$GLOBALS['TYPO3_CONF_VARS']['SYS']['trustedHostsPattern'] = '(typo3\\.woodwolfdigital\\.com|localhost|127\\.0\\.0\\.1|astrotypo3-typo3)';

// Staging: never display errors to visitors, log them instead.
$GLOBALS['TYPO3_CONF_VARS']['SYS']['displayErrors'] = 0;
$GLOBALS['TYPO3_CONF_VARS']['SYS']['errorHandlerErrors'] = E_ALL & ~E_DEPRECATED & ~E_NOTICE;
$GLOBALS['TYPO3_CONF_VARS']['LOG']['writerConfiguration'] = [
    \Psr\Log\LogLevel::WARNING => [
        \TYPO3\CMS\Core\Log\Writer\FileWriter::class => ['logFileInfix' => 'error'],
    ],
];
