<?php
declare(strict_types=1);
defined('TYPO3') or die();

use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

/**
 * Registry driven CType registration.
 *
 * Every astro builder component whose CType starts with astro_builder_ is
 * registered as a TYPO3 core content element type, and every custom element
 * type stored in tx_astrobuilder_element_type is registered the same way.
 * The GrapesJS block id, the registry component id and the CType stay one
 * consistent naming scheme (astro_builder_<id with dots as underscores>).
 *
 * This file runs at TCA build time. A type created through the API therefore
 * becomes selectable in the backend element wizard only after a cache
 * flush; the API itself lists and writes it immediately.
 *
 * Per-component fields beyond the generic ones live in the props store
 * (tx_astrobuilder_element.props, keyed by tt_content_uid), so the showitem
 * intentionally uses only generic core fields: header and bodytext.
 */
(static function (): void {
    $astroTypes = [];

    $contractPath = ExtensionManagementUtility::extPath('astro_builder') . 'Resources/Private/Contract/registry.json';
    if (is_file($contractPath)) {
        $registry = json_decode((string)file_get_contents($contractPath), true);
        foreach (($registry['components'] ?? []) as $component) {
            if (!is_array($component)) {
                continue;
            }
            $ctype = (string)($component['typo3Ctype'] ?? '');
            if (str_starts_with($ctype, 'astro_builder_')) {
                $astroTypes[$ctype] = (string)($component['label'] ?? $ctype);
            }
        }
    }

    // Custom element types created through the API. TYPO3 forbids using the
    // ConnectionPool during TCA loading ("Use lazy loading instead"), so the
    // registry table is read through a plain PDO connection built from the
    // TYPO3 database configuration. Failures are ignored: the table may not
    // exist yet before extension setup, and core types above still register.
    try {
        $dbConfig = $GLOBALS['TYPO3_CONF_VARS']['DB']['Connections']['Default'] ?? null;
        $pdo = null;
        if (is_array($dbConfig)) {
            $driver = (string)($dbConfig['driver'] ?? '');
            if ($driver === 'pdo_sqlite' && (string)($dbConfig['path'] ?? '') !== '') {
                $pdo = new \PDO('sqlite:' . (string)$dbConfig['path']);
            } elseif ($driver === 'pdo_mysql' || $driver === 'mysqli') {
                $dsn = 'mysql:host=' . (string)($dbConfig['host'] ?? 'localhost')
                    . ';port=' . (int)($dbConfig['port'] ?? 3306)
                    . ';dbname=' . (string)($dbConfig['dbname'] ?? '');
                $pdo = new \PDO($dsn, (string)($dbConfig['user'] ?? ''), (string)($dbConfig['password'] ?? ''));
            }
        }
        if ($pdo instanceof \PDO) {
            $statement = $pdo->query('SELECT type_id, label FROM tx_astrobuilder_element_type WHERE deleted = 0 AND hidden = 0');
            foreach (($statement !== false ? $statement->fetchAll(\PDO::FETCH_ASSOC) : []) as $row) {
                $ctype = 'astro_builder_' . str_replace(['.', '-'], '_', (string)$row['type_id']);
                $astroTypes[$ctype] = (string)($row['label'] ?? $ctype);
            }
        }
    } catch (\Throwable) {
        // See comment above; registration of core types must not break when
        // the custom type table is unavailable at TCA build time.
    }

    if ($astroTypes === []) {
        return;
    }

    $GLOBALS['TCA']['tt_content']['columns']['CType']['config']['itemGroups']['astro_builder'] = 'Astro Builder';

    foreach ($astroTypes as $ctype => $label) {
        ExtensionManagementUtility::addTcaSelectItem(
            'tt_content',
            'CType',
            [
                'label' => $label,
                'value' => $ctype,
                'icon' => 'content-text',
                'group' => 'astro_builder',
            ]
        );
        $GLOBALS['TCA']['tt_content']['types'][$ctype] = [
            'showitem' => '--div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:general, header, subheader, bodytext, --div--;LLL:EXT:frontend/Resources/Private/Language/locallang_ttc.xlf:tabs.appearance, layout, --palette--;;framelogic, --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:access, hidden, starttime, endtime',
        ];
    }
})();
