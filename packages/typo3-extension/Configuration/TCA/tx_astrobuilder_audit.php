<?php
declare(strict_types=1);
return [
    'ctrl' => ['title' => 'tx_astrobuilder_audit', 'label' => 'action', 'tstamp' => 'tstamp', 'crdate' => 'crdate', 'delete' => 'deleted', 'enablecolumns' => ['disabled' => 'hidden']],
    'types' => ['1' => ['showitem' => 'action, page_uid, summary']],
    'columns' => ['action' => ['label' => 'action', 'config' => ['type' => 'input']], 'page_uid' => ['label' => 'page_uid', 'config' => ['type' => 'input']], 'summary' => ['label' => 'summary', 'config' => ['type' => 'input']]],
];
