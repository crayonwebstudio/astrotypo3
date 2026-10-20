<?php
declare(strict_types=1);
return [
    'ctrl' => ['title' => 'tx_astrobuilder_element', 'label' => 'element_id', 'tstamp' => 'tstamp', 'crdate' => 'crdate', 'delete' => 'deleted', 'enablecolumns' => ['disabled' => 'hidden']],
    'types' => ['1' => ['showitem' => 'element_id, component_id, page_uid, tt_content_uid, props']],
    'columns' => ['element_id' => ['label' => 'element_id', 'config' => ['type' => 'input']], 'component_id' => ['label' => 'component_id', 'config' => ['type' => 'input']], 'page_uid' => ['label' => 'page_uid', 'config' => ['type' => 'input']], 'tt_content_uid' => ['label' => 'tt_content_uid', 'config' => ['type' => 'input']], 'props' => ['label' => 'props', 'config' => ['type' => 'input']]],
];
