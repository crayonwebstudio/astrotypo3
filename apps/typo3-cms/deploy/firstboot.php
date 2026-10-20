<?php
declare(strict_types=1);

/**
 * First boot installer for the AstroTYPO3 TYPO3 container.
 *
 * Idempotent. "Installed" means: settings.php exists, its database driver
 * is pdo_sqlite, and the sqlite database actually contains the be_users
 * table. Anything short of that triggers installation:
 *
 *   1. Official TYPO3 setup CLI with --driver=sqlite (the supported way
 *      to create the initial schema; database:updateschema cannot
 *      bootstrap an empty database because extensions query their own
 *      tables during that command).
 *   2. Manual fallback: write settings.php, then database:updateschema.
 *
 * Afterwards it ensures the schema is current, syncs the install tool
 * password from the environment, and seeds the backend admin user, the
 * root page, an about page and the root TypoScript template directly.
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
    foreach (array_slice($output, -30) as $line) {
        echo '    ' . $line . "\n";
    }
    fbLog('exit code: ' . $code);
    return $code;
}

function fbConfiguredDriver(string $settingsFile): ?string
{
    if (!is_file($settingsFile)) {
        return null;
    }
    $settings = require $settingsFile;
    if (!is_array($settings)) {
        return null;
    }
    $driver = $settings['DB']['Connections']['Default']['driver'] ?? null;
    return is_string($driver) ? $driver : null;
}

function fbSqliteHasTable(string $dbFile, string $table): bool
{
    if (!is_file($dbFile)) {
        return false;
    }
    try {
        $pdo = new PDO('sqlite:' . $dbFile);
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?");
        $stmt->execute([$table]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Throwable) {
        return false;
    }
}

function fbIsInstalled(string $settingsFile, string $dbFile): bool
{
    return is_file($settingsFile)
        && fbConfiguredDriver($settingsFile) === 'pdo_sqlite'
        && fbSqliteHasTable($dbFile, 'be_users');
}

if ($adminPassword === '' || $installPassword === '') {
    fbLog('ERROR: TYPO3_ADMIN_PASSWORD and TYPO3_INSTALL_PASSWORD must be set. Skipping setup.');
    return;
}

chdir($appDir);

// ---------------------------------------------------------------------------
// Step 1: installation (settings.php + database schema)
// ---------------------------------------------------------------------------
if (!fbIsInstalled($settingsFile, $dbFile)) {
    fbLog('not installed yet, trying official typo3 setup CLI (driver sqlite)');
    if (is_file($dbFile) && !fbSqliteHasTable($dbFile, 'be_users')) {
        // An empty or schema-less sqlite file blocks the setup; remove it.
        unlink($dbFile);
        fbLog('removed schema-less sqlite file so setup can create it');
    }
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

if (!fbIsInstalled($settingsFile, $dbFile) && fbConfiguredDriver($settingsFile) !== 'pdo_sqlite') {
    fbLog('setup CLI did not produce a sqlite installation, using manual settings fallback');
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
    if (!is_dir(dirname($settingsFile))) {
        mkdir(dirname($settingsFile), 0775, true);
    }
    file_put_contents($settingsFile, "<?php\nreturn " . var_export($settings, true) . ";\n");
    fbLog('settings.php written by fallback');
}

if (!fbIsInstalled($settingsFile, $dbFile)) {
    // Schema creation attempt for the fallback path (and a repair attempt
    // if the setup CLI created settings but no schema). Run twice: the
    // first pass creates most tables even if a late step fails.
    fbRun('vendor/bin/typo3 database:updateschema');
    if (!fbIsInstalled($settingsFile, $dbFile)) {
        fbRun('vendor/bin/typo3 database:updateschema');
    }
}

if (!fbIsInstalled($settingsFile, $dbFile)) {
    $found = glob($appDir . '/var/**/*.sqlite') ?: [];
    $found = array_merge($found, glob($appDir . '/var/*.sqlite') ?: []);
    foreach ($found as $candidate) {
        if (fbSqliteHasTable($candidate, 'be_users')) {
            $dbFile = $candidate;
            fbLog('using sqlite database at ' . $dbFile);
            break;
        }
    }
}

if (!fbIsInstalled($settingsFile, $dbFile)) {
    fbLog('ERROR: installation did not succeed. TYPO3 will not work until this is fixed.');
    return;
}
fbLog('installation present (settings + sqlite schema)');

// Sync the install tool password with the environment.
$current = require $settingsFile;
if (is_array($current)) {
    $hash = $current['BE']['installToolPassword'] ?? '';
    if (!is_string($hash) || !password_verify($installPassword, $hash)) {
        $current['BE']['installToolPassword'] = password_hash($installPassword, PASSWORD_ARGON2I);
        file_put_contents($settingsFile, "<?php\nreturn " . var_export($current, true) . ";\n");
        fbLog('install tool password updated from environment');
    }
}

// ---------------------------------------------------------------------------
// Step 2: schema updates for extension tables, then seeding
// ---------------------------------------------------------------------------
fbRun('vendor/bin/typo3 database:updateschema');

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

    $rootExists = (int)$pdo->query('SELECT COUNT(*) FROM pages WHERE uid = 1')->fetchColumn() > 0;
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

    $aboutExists = (int)$pdo->query('SELECT COUNT(*) FROM pages WHERE uid = 2')->fetchColumn() > 0;
    if (!$aboutExists) {
        $stmt = $pdo->prepare(
            'INSERT INTO pages (uid, pid, tstamp, crdate, doktype, title, slug, is_siteroot, hidden, deleted, sorting, sys_language_uid, perms_userid, perms_groupid, perms_user, perms_group, perms_everybody)'
            . ' VALUES (2, 1, ?, ?, 1, ?, ?, 0, 0, 0, 512, 0, 1, 0, 0, 0, 0)'
        );
        $stmt->execute([$now, $now, 'About', '/about']);
        fbLog('about page created (uid 2, slug /about)');
    }

    $templateExists = (int)$pdo->query('SELECT COUNT(*) FROM sys_template WHERE uid = 1')->fetchColumn() > 0;
    if (!$templateExists) {
        $typoscript = implode("\n", [
            'page = PAGE',
            'page.10 = TEXT',
            'page.10.data = page:title',
            'page.10.wrap = <h1>|</h1>',
            'page.20 = TEXT',
            'page.20.value = This TYPO3 13 instance is the API backend for the AstroTYPO3 frontend. Content is served through the astro_builder content API. The public website is rendered by Astro.',
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
// Step 3: caches
// ---------------------------------------------------------------------------
fbRun('vendor/bin/typo3 cache:flush');
fbLog('done');
