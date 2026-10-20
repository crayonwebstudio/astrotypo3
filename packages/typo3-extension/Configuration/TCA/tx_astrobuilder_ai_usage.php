<?php
declare(strict_types=1);
return [
    'ctrl' => ['title' => 'tx_astrobuilder_ai_usage', 'label' => 'provider', 'tstamp' => 'tstamp', 'crdate' => 'crdate', 'delete' => 'deleted', 'enablecolumns' => ['disabled' => 'hidden']],
    'types' => ['1' => ['showitem' => 'provider, model, status']],
    'columns' => ['provider' => ['label' => 'provider', 'config' => ['type' => 'input']], 'model' => ['label' => 'model', 'config' => ['type' => 'input']], 'status' => ['label' => 'status', 'config' => ['type' => 'input']]],
];
