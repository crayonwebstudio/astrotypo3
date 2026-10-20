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

    // Custom element types created through the API. The database may not be
    // ready during early bootstrap or install, so failures are ignored here.
    try {
        $connection = \TYPO3\CMS\Core\Utility\GeneralUtility::makeInstance(
            \TYPO3\CMS\Core\Database\ConnectionPool::class
        )->getConnectionForTable('tx_astrobuilder_element_type');
        foreach ($connection->select(['type_id', 'label'], 'tx_astrobuilder_element_type', ['deleted' => 0, 'hidden' => 0]) as $row) {
            $ctype = 'astro_builder_' . str_replace(['.', '-'], '_', (string)$row['type_id']);
            $astroTypes[$ctype] = (string)($row['label'] ?? $ctype);
        }
    } catch (\Throwable) {
        // Table does not exist yet (before extension setup); core types from
        // the bundled contract above are still registered.
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
