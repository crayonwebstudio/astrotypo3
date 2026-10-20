<?php
declare(strict_types=1);

/**
 * First boot installer for the AstroTYPO3 TYPO3 container.
 *
 * Idempotent. On a fresh instance (no settings.php) it tries the official
 * TYPO3 setup CLI first. If that does not produce a working installation,
 * it falls back to writing settings.php manually, creating the schema with
 * database:updateschema and creating the admin user directly.
 * On later boots it only ensures schema, admin user, root page and the
 * root TypoScript template exist.
 *
 * Credentials come from the environment (TYPO3_ADMIN_PASSWORD,
 * TYPO3_INSTALL_PASSWORD). They are never printed.
 */

$appDir = getenv('TYPO3_APP_DIR') ?: '/var/www/apps/typo3-cms';
$settingsFile = $appDir . '/config/system/settings.php';
$dbFile = $appDir . '/var/sqlite/cms.sqlite';
$adminUser = 'astro_admin';
$adminEmail = 'astro_admin@example.invalid';
$adminPassword = (string)(getenv('TYPO3_ADMIN_PASSWORD') ?: '');
$installPassword = (string)(getenv('TYPO3_INSTALL_PASSWORD') ?: '');

function fbLog(string $message): void
{
    echo '[firstboot] ' . $message . "\n";
}

function fbRun(string $command): int
{
    fbLog('running: ' . preg_replace('/(--[a-z-]*password=)(\S+)/', '$1***', $command));
    $output = [];
    $code = 0;
    exec($command . ' 2>&1', $output, $code);
    foreach (array_slice($output, -25) as $line) {
        echo '    ' . $line . "\n";
    }
    fbLog('exit code: ' . $code);
    return $code;
}

if ($adminPassword === '' || $installPassword === '') {
    fbLog('ERROR: TYPO3_ADMIN_PASSWORD and TYPO3_INSTALL_PASSWORD must be set. Skipping setup.');
    return;
}

chdir($appDir);

// ---------------------------------------------------------------------------
// Step 1: installation (settings.php + database)
// ---------------------------------------------------------------------------
if (!is_file($settingsFile)) {
    fbLog('no settings.php found, trying official typo3 setup CLI');
    $setupCommand = sprintf(
        'vendor/bin/typo3 setup --no-interaction --force --driver=%s --project-name=%s --server-type=%s'
        . ' --admin-username=%s --admin-user-password=%s --admin-email=%s',
        escapeshellarg('sqlite'),
        escapeshellarg('AstroTYPO3'),
        escapeshellarg('apache'),
        escapeshellarg($adminUser),
        escapeshellarg($adminPassword),
        escapeshellarg($adminEmail)
    );
    fbRun($setupCommand);
}

// The setup command can leave a settings.php behind even when it fails
// (with a default mysqli connection). Only a settings.php that actually
// points at pdo_sqlite counts as installed here.
$configuredDriver = null;
if (is_file($settingsFile)) {
    $existingSettings = require $settingsFile;
    if (is_array($existingSettings)) {
        $configuredDriver = $existingSettings['DB']['Connections']['Default']['driver'] ?? null;
    }
}
if (!is_file($settingsFile) || $configuredDriver !== 'pdo_sqlite') {
    fbLog('no working sqlite settings found (driver: ' . var_export($configuredDriver, true) . '), using manual fallback');
    $settings = [
        'BE' => [
            'debug' => false,
            'installToolPassword' => password_hash($installPassword, PASSWORD_ARGON2I),
            'passwordHashing' => ['className' => 'TYPO3\\CMS\\Core\\Crypto\\PasswordHashing\\Argon2iPasswordHash', 'options' => []],
        ],
        'DB' => [
            'Connections' => [
                'Default' => [
                    'charset' => 'utf8',
                    'driver' => 'pdo_sqlite',
                    'path' => $dbFile,
                ],
            ],
        ],
        'EXTENSIONS' => [],
        'FE' => [
            'debug' => false,
            'passwordHashing' => ['className' => 'TYPO3\\CMS\\Core\\Crypto\\PasswordHashing\\Argon2PasswordHash', 'options' => []],
        ],
        'GFX' => [
            'imagefile_ext' => 'gif,jpg,jpeg,tif,tiff,bmp,pcx,tga,png,pdf,ai,svg',
            'processor' => 'ImageMagick',
            'processor_allowTemporaryMasksAsPng' => false,
            'processor_colorspace' => 'RGB',
            'processor_effects' => true,
            'processor_enabled' => true,
            'processor_path' => '/usr/bin/',
        ],
        'LOG' => [],
        'MAIL' => ['transport' => 'sendmail', 'transport_sendmail_command' => '/usr/sbin/sendmail -bs'],
        'SYS' => [
            'caching' => ['cacheConfigurations' => ['hash' => ['backend' => 'TYPO3\\CMS\\Core\\Cache\\Backend\\Typo3DatabaseBackend']]],
            'devIPmask' => '',
            'displayErrors' => 0,
            'encryptionKey' => bin2hex(random_bytes(32)),
            'exceptionalErrors' => 4096,
            'features' => ['yamlImportsFollowDeclarationOrder' => true],
            'sitename' => 'AstroTYPO3',
            'systemLocale' => 'en_US.utf8',
            'systemMaintainers' => [1],
        ],
    ];
    $content = "<?php\nreturn " . var_export($settings, true) . ";\n";
    if (!is_dir(dirname($settingsFile))) {
        mkdir(dirname($settingsFile), 0775, true);
    }
    file_put_contents($settingsFile, $content);
    fbLog('settings.php written by fallback');
}

// Make sure the install tool password matches the environment, in case the
// setup CLI created settings.php with its own value.
if (is_file($settingsFile)) {
    $current = require $settingsFile;
    if (is_array($current)) {
        $hash = $current['BE']['installToolPassword'] ?? '';
        if (!is_string($hash) || !password_verify($installPassword, $hash)) {
            $current['BE']['installToolPassword'] = password_hash($installPassword, PASSWORD_ARGON2I);
            file_put_contents($settingsFile, "<?php\nreturn " . var_export($current, true) . ";\n");
            fbLog('install tool password updated from environment');
        }
    }
}

// ---------------------------------------------------------------------------
// Step 2: database schema (creates all core and extension tables)
// ---------------------------------------------------------------------------
fbRun('vendor/bin/typo3 database:updateschema');

if (!is_file($dbFile)) {
    // The setup CLI may use a different sqlite location. Look for it.
    $found = glob($appDir . '/var/**/*.sqlite', GLOB_BRACE) ?: [];
    $found = array_merge($found, glob($appDir . '/var/*.sqlite') ?: []);
    if ($found !== []) {
        $dbFile = $found[0];
        fbLog('using sqlite database at ' . $dbFile);
    } else {
        fbLog('ERROR: no sqlite database file found after setup. TYPO3 will not work.');
        return;
    }
}

// ---------------------------------------------------------------------------
// Step 3: admin user, root page, root template (direct PDO, idempotent)
// ---------------------------------------------------------------------------
try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $now = time();

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM be_users WHERE username = ?');
    $stmt->execute([$adminUser]);
    if ((int)$stmt->fetchColumn() === 0) {
        $stmt = $pdo->prepare(
            'INSERT INTO be_users (pid, tstamp, crdate, username, password, admin, email, realName, disable, deleted, starttime, endtime)'
            . ' VALUES (0, ?, ?, ?, ?, 1, ?, ?, 0, 0, 0, 0)'
        );
        $stmt->execute([$now, $now, $adminUser, password_hash($adminPassword, PASSWORD_ARGON2I), $adminEmail, 'AstroTYPO3 Admin']);
        fbLog('backend admin user created (uid ' . $pdo->lastInsertId() . ')');
    } else {
        fbLog('backend admin user already exists');
    }

    $rootExists = (int)$pdo->query("SELECT COUNT(*) FROM pages WHERE uid = 1")->fetchColumn() > 0;
    if (!$rootExists) {
        $stmt = $pdo->prepare(
            'INSERT INTO pages (uid, pid, tstamp, crdate, doktype, title, slug, is_siteroot, hidden, deleted, sorting, sys_language_uid, perms_userid, perms_groupid, perms_user, perms_group, perms_everybody)'
            . ' VALUES (1, 0, ?, ?, 1, ?, ?, 1, 0, 0, 256, 0, 1, 0, 0, 0, 0)'
        );
        $stmt->execute([$now, $now, 'Home', '/']);
        fbLog('root page created (uid 1, slug /)');
    } else {
        fbLog('root page already exists');
    }

    $aboutExists = (int)$pdo->query("SELECT COUNT(*) FROM pages WHERE uid = 2")->fetchColumn() > 0;
    if (!$aboutExists) {
        $stmt = $pdo->prepare(
            'INSERT INTO pages (uid, pid, tstamp, crdate, doktype, title, slug, is_siteroot, hidden, deleted, sorting, sys_language_uid, perms_userid, perms_groupid, perms_user, perms_group, perms_everybody)'
            . ' VALUES (2, 1, ?, ?, 1, ?, ?, 0, 0, 0, 512, 0, 1, 0, 0, 0, 0)'
        );
        $stmt->execute([$now, $now, 'About', '/about']);
        fbLog('about page created (uid 2, slug /about)');
    }

    $templateExists = (int)$pdo->query("SELECT COUNT(*) FROM sys_template WHERE uid = 1")->fetchColumn() > 0;
    if (!$templateExists) {
        $typoscript = implode("\n", [
            'page = PAGE',
            'page.10 = TEXT',
            'page.10.data = page:title',
            'page.10.wrap = <h1>|</h1>',
            'page.20 = TEXT',
            'page.20.value = This TYPO3 13 instance provides content for the AstroTYPO3 frontend through the astro_builder content API at /api/content/v1. The public website is rendered by Astro.',
            'page.20.wrap = <p>|</p>',
        ]);
        $stmt = $pdo->prepare(
            'INSERT INTO sys_template (uid, pid, tstamp, crdate, title, root, clear, config, constants, hidden, deleted, sorting)'
            . ' VALUES (1, 1, ?, ?, ?, 1, 3, ?, ?, 0, 0, 0)'
        );
        $stmt->execute([$now, $now, 'AstroTYPO3 root template', $typoscript, '']);
        fbLog('root TypoScript template created');
    } else {
        fbLog('root template already exists');
    }

    $tableCheck = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tx_astrobuilder%'")->fetchAll(PDO::FETCH_COLUMN);
    fbLog('astro_builder tables present: ' . ($tableCheck ? implode(', ', $tableCheck) : 'NONE'));
} catch (Throwable $e) {
    fbLog('ERROR during database seeding: ' . $e->getMessage());
}

// ---------------------------------------------------------------------------
// Step 4: caches
// ---------------------------------------------------------------------------
fbRun('vendor/bin/typo3 cache:flush');
fbLog('done');
