<?php
declare(strict_types=1);

// Frontend entry point, TYPO3 v13 composer mode standard bootstrap.
call_user_func(static function () {
    $classLoader = require dirname(__DIR__) . '/vendor/autoload.php';
    \TYPO3\CMS\Core\Core\SystemEnvironmentBuilder::run(0, \TYPO3\CMS\Core\Core\SystemEnvironmentBuilder::REQUESTTYPE_FE);
    \TYPO3\CMS\Core\Core\Bootstrap::init($classLoader)->get(\TYPO3\CMS\Core\Http\Application::class)->run();
});
