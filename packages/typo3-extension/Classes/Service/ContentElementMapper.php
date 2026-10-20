<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

use Crayonwebstudio\AstroBuilder\Domain\Model\Element;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\DataHandling\DataHandler;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * Two-way mapping between builder elements and TYPO3 core content elements.
 *
 * Read direction: tt_content records of a page (colPos 0, ordered by sorting)
 * become contract elements with id "ttcontent-<uid>". The CType decides the
 * componentId: astro custom CTypes (astro_builder_<component id with dots
 * replaced by underscores>) map through the "typo3Ctype" field of the shared
 * registry; core CTypes use the static map below. Unknown CTypes fall back
 * to content.rich-text so no visible content silently disappears.
 *
 * Props split (documented contract):
 * - Core CTypes take their props from the native tt_content fields
 *   (header, subheader, bodytext, header_layout, header_position, FAL image).
 * - Astro custom CTypes, and every element saved through the builder API,
 *   keep their full props as JSON in tx_astrobuilder_element, keyed by
 *   tt_content_uid. Nested builder children are stored inside that JSON
 *   under "_children" because core tt_content has no generic parent column
 *   without a container extension.
 *
 * Write direction: persistPageElements() writes through DataHandler with a
 * backend user context, so TCA validation, permissions and revisions stay
 * native TYPO3. Only records linked to a tx_astrobuilder_element props row
 * count as builder managed and can ever be deleted by a save.
 */
final class ContentElementMapper
{
    /** Core CType to componentId. bullets and table intentionally fall back
     *  to rich text: they have no dedicated renderer in the core library. */
    private const CORE_CTYPE_TO_COMPONENT = [
        'text' => 'content.rich-text',
        'textpic' => 'content.image',
        'image' => 'content.image',
        'header' => 'content.heading',
        'bullets' => 'content.rich-text',
        'table' => 'content.rich-text',
        'div' => 'content.divider',
    ];

    public function __construct(
        private readonly ComponentRegistryService $registryService,
        private readonly ?ElementTypeRegistryService $elementTypeRegistry = null,
    ) {
    }

    public function componentIdForCType(string $ctype): string
    {
        foreach ($this->registryService->getRegistry()['components'] ?? [] as $component) {
            if (is_array($component) && ($component['typo3Ctype'] ?? '') === $ctype && isset($component['id'])) {
                return (string)$component['id'];
            }
        }
        if ($this->elementTypeRegistry !== null) {
            foreach ($this->elementTypeRegistry->listTypes() as $type) {
                if (($type['source'] ?? '') === 'custom' && ($type['ctype'] ?? '') === $ctype) {
                    return (string)$type['id'];
                }
            }
        }
        return self::CORE_CTYPE_TO_COMPONENT[$ctype] ?? 'content.rich-text';
    }

    public function ctypeForComponent(string $componentId): string
    {
        $component = $this->registryService->getComponent($componentId);
        $ctype = is_array($component) ? (string)($component['typo3Ctype'] ?? '') : '';
        if ($ctype !== '') {
            return $ctype;
        }
        return 'astro_builder_' . str_replace(['.', '-'], '_', $componentId);
    }

    /**
     * @return list<Element>
     */
    public function elementsForPage(int $pageUid, bool $includeHidden = false): array
    {
        $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
        $queryBuilder = $connectionPool->getQueryBuilderForTable('tt_content');
        $queryBuilder->select('uid', 'CType', 'header', 'subheader', 'bodytext', 'header_layout', 'header_position', 'sorting')
            ->from('tt_content')
            ->where($queryBuilder->expr()->eq('pid', $queryBuilder->createNamedParameter($pageUid, Connection::PARAM_INT)))
            ->andWhere($queryBuilder->expr()->eq('colPos', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)))
            ->andWhere($queryBuilder->expr()->eq('deleted', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)))
            ->orderBy('sorting', 'ASC');
        if (!$includeHidden) {
            $queryBuilder->andWhere($queryBuilder->expr()->eq('hidden', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)));
        }
        $rows = $queryBuilder->executeQuery()->fetchAllAssociative();

        $propsByContentUid = $this->propsRowsForPage($pageUid);

        $elements = [];
        foreach ($rows as $row) {
            $uid = (int)$row['uid'];
            $componentId = $this->componentIdForCType((string)$row['CType']);
            $stored = $propsByContentUid[$uid] ?? null;
            $children = [];
            if ($stored !== null) {
                $props = $stored;
                $childData = $props['_children'] ?? [];
                unset($props['_children']);
                if (is_array($childData)) {
                    foreach ($childData as $child) {
                        if (is_array($child)) {
                            $children[] = Element::fromArray($child);
                        }
                    }
                }
            } else {
                $props = $this->nativeProps($row, $componentId, $uid);
            }
            $elements[] = new Element('ttcontent-' . $uid, $componentId, is_array($props) ? $props : [], $children);
        }
        return $elements;
    }

    /**
     * Persist the elements of one page through DataHandler.
     *
     * @param list<Element> $elements
     * @return list<Element> the page elements as stored after the save
     * @throws \RuntimeException when DataHandler reports errors
     */
    public function persistPageElements(int $pageUid, array $elements): array
    {
        $this->ensureBackendUser();
        $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);

        // Builder managed records of this page: linked through a props row.
        $managedUids = [];
        $propsConnection = $connectionPool->getConnectionForTable('tx_astrobuilder_element');
        foreach ($propsConnection->select(['tt_content_uid'], 'tx_astrobuilder_element', ['page_uid' => $pageUid])->fetchAllAssociative() as $row) {
            $uid = (int)($row['tt_content_uid'] ?? 0);
            if ($uid > 0) {
                $managedUids[$uid] = true;
            }
        }
        $existingOnPage = [];
        $contentConnection = $connectionPool->getConnectionForTable('tt_content');
        foreach ($contentConnection->select(['uid'], 'tt_content', ['pid' => $pageUid, 'deleted' => 0])->fetchAllAssociative() as $row) {
            $existingOnPage[(int)$row['uid']] = true;
        }

        $dataMap = ['tt_content' => []];
        $placeholders = [];
        $keptUids = [];
        foreach ($elements as $index => $element) {
            $ctype = $this->ctypeForComponent($element->componentId);
            $fields = [
                'CType' => $ctype,
                'colPos' => 0,
                'sorting' => ($index + 1) * 128,
                'header' => $this->headerFromProps($element),
                'bodytext' => $this->bodytextFromProps($element),
            ];
            $existingUid = $this->uidFromElementId($element->id);
            if ($existingUid > 0 && isset($existingOnPage[$existingUid])) {
                $dataMap['tt_content'][$existingUid] = $fields;
                $keptUids[$existingUid] = true;
                $placeholders[$index] = $existingUid;
            } else {
                $placeholder = 'NEW_builder_' . $index;
                $fields['pid'] = $pageUid;
                $dataMap['tt_content'][$placeholder] = $fields;
                $placeholders[$index] = $placeholder;
            }
        }

        $cmdMap = ['tt_content' => []];
        foreach (array_keys($managedUids) as $managedUid) {
            if (!isset($keptUids[$managedUid]) && isset($existingOnPage[$managedUid])) {
                $cmdMap['tt_content'][$managedUid] = ['delete' => 1];
            }
        }

        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start($dataMap, $cmdMap);
        $dataHandler->process_datamap();
        if ($cmdMap['tt_content'] !== []) {
            $dataHandler->process_cmdmap();
        }
        if ($dataHandler->errorLog !== []) {
            throw new \RuntimeException('DataHandler errors: ' . implode(' | ', $dataHandler->errorLog));
        }

        // Store the full props per element, keyed by the real tt_content uid.
        $resolvedUids = [];
        foreach ($elements as $index => $element) {
            $placeholder = $placeholders[$index];
            $contentUid = is_int($placeholder) ? $placeholder : (int)($dataHandler->substNEWwithIDs[$placeholder] ?? 0);
            if ($contentUid <= 0) {
                throw new \RuntimeException('DataHandler did not assign a uid for element ' . $element->id);
            }
            $resolvedUids[$index] = $contentUid;
            $props = $element->props;
            if ($element->children !== []) {
                $props['_children'] = array_map(static fn (Element $child): array => $child->toArray(), $element->children);
            }
            $values = [
                'pid' => $pageUid,
                'page_uid' => $pageUid,
                'element_id' => 'ttcontent-' . $contentUid,
                'component_id' => $element->componentId,
                'props' => json_encode($props),
                'sorting' => ($index + 1) * 128,
                'tstamp' => time(),
            ];
            $existingRow = $propsConnection->select(['uid'], 'tx_astrobuilder_element', ['tt_content_uid' => $contentUid])->fetchAssociative();
            if (is_array($existingRow)) {
                $propsConnection->update('tx_astrobuilder_element', $values, ['uid' => (int)$existingRow['uid']]);
            } else {
                $values['tt_content_uid'] = $contentUid;
                $values['crdate'] = time();
                $propsConnection->insert('tx_astrobuilder_element', $values);
            }
        }

        // DataHandler renumbers the sorting field of new records with its
        // own small sequential values, which scrambles the payload order
        // relative to the values written above. Normalize the sorting of
        // the saved records to the payload order afterwards.
        foreach ($resolvedUids as $index => $contentUid) {
            $contentConnection->update('tt_content', ['sorting' => ($index + 1) * 128], ['uid' => $contentUid]);
        }

        return $this->elementsForPage($pageUid, true);
    }

    /** @return array<int, array<string, mixed>> props rows keyed by tt_content uid */
    private function propsRowsForPage(int $pageUid): array
    {
        $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
        $connection = $connectionPool->getConnectionForTable('tx_astrobuilder_element');
        $map = [];
        try {
            // DBAL 4: Connection::select() returns a Result object, which is
            // not iterable; fetchAllAssociative() is required (a plain foreach
            // over the Result silently yields no rows).
            $rows = $connection->select(['tt_content_uid', 'props'], 'tx_astrobuilder_element', ['page_uid' => $pageUid])->fetchAllAssociative();
        } catch (\Throwable) {
            return [];
        }
        foreach ($rows as $row) {
            $uid = (int)($row['tt_content_uid'] ?? 0);
            if ($uid <= 0) {
                continue;
            }
            $decoded = json_decode((string)($row['props'] ?? ''), true);
            $map[$uid] = is_array($decoded) ? $decoded : [];
        }
        return $map;
    }

    /** @param array<string, mixed> $row */
    private function nativeProps(array $row, string $componentId, int $contentUid): array
    {
        $header = (string)($row['header'] ?? '');
        $bodytext = (string)($row['bodytext'] ?? '');
        return match ($componentId) {
            'content.heading' => [
                'text' => $header,
                'level' => $this->headingLevel((int)($row['header_layout'] ?? 0)),
                'align' => (string)($row['header_position'] ?? ''),
            ],
            'content.image' => [
                'src' => $this->falImageUrl($contentUid) ?? '',
                'alt' => '',
                'caption' => (string)($row['subheader'] ?? ''),
            ],
            'content.divider' => ['style' => 'line'],
            default => $this->genericProps($header, $bodytext),
        };
    }

    /** @return array<string, mixed> */
    private function genericProps(string $header, string $bodytext): array
    {
        $props = ['html' => $bodytext];
        if ($header !== '') {
            $props['heading'] = $header;
        }
        return $props;
    }

    private function headingLevel(int $layout): int
    {
        return $layout >= 1 && $layout <= 6 ? $layout : 2;
    }

    /**
     * Best effort FAL resolution: first image reference of the record becomes
     * a public /fileadmin URL. Returns null when the record has no image.
     */
    private function falImageUrl(int $contentUid): ?string
    {
        try {
            $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
            $reference = $connectionPool->getConnectionForTable('sys_file_reference')->select(
                ['uid_local'],
                'sys_file_reference',
                ['tablenames' => 'tt_content', 'fieldname' => 'image', 'uid_foreign' => $contentUid, 'deleted' => 0],
            )->fetchAssociative();
            if (!is_array($reference)) {
                return null;
            }
            $file = $connectionPool->getConnectionForTable('sys_file')->select(
                ['identifier'],
                'sys_file',
                ['uid' => (int)$reference['uid_local']],
            )->fetchAssociative();
            if (!is_array($file) || (string)($file['identifier'] ?? '') === '') {
                return null;
            }
            return '/fileadmin' . (string)$file['identifier'];
        } catch (\Throwable) {
            return null;
        }
    }

    private function headerFromProps(Element $element): string
    {
        foreach (['text', 'heading', 'label', 'title'] as $key) {
            $value = $element->props[$key] ?? null;
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }
        return '';
    }

    private function bodytextFromProps(Element $element): string
    {
        foreach (['html', 'text'] as $key) {
            $value = $element->props[$key] ?? null;
            if (is_string($value)) {
                return $value;
            }
        }
        return '';
    }

    private function uidFromElementId(string $id): int
    {
        if (str_starts_with($id, 'ttcontent-')) {
            return (int)substr($id, strlen('ttcontent-'));
        }
        return 0;
    }

    /**
     * Builder saves run through DataHandler, which requires a backend user.
     * The API uses its own backend user context: the user named by
     * ASTRO_BUILDER_BUILDER_USER, or the first active admin otherwise.
     * DataHandler applies that user's permissions to every write.
     */
    private function ensureBackendUser(): void
    {
        if (($GLOBALS['BE_USER'] ?? null) instanceof BackendUserAuthentication && (int)($GLOBALS['BE_USER']->user['uid'] ?? 0) > 0) {
            return;
        }
        $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
        $connection = $connectionPool->getConnectionForTable('be_users');
        $username = trim((string)(getenv('ASTRO_BUILDER_BUILDER_USER') ?: ''));
        $row = false;
        if ($username !== '') {
            $row = $connection->select(['uid'], 'be_users', ['username' => $username, 'deleted' => 0, 'disable' => 0])->fetchAssociative();
        }
        if (!is_array($row)) {
            $queryBuilder = $connectionPool->getQueryBuilderForTable('be_users');
            $row = $queryBuilder->select('uid')->from('be_users')
                ->where($queryBuilder->expr()->eq('admin', $queryBuilder->createNamedParameter(1, Connection::PARAM_INT)))
                ->andWhere($queryBuilder->expr()->eq('deleted', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)))
                ->andWhere($queryBuilder->expr()->eq('disable', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)))
                ->orderBy('uid', 'ASC')
                ->executeQuery()->fetchAssociative();
        }
        if (!is_array($row)) {
            throw new \RuntimeException('No backend user available for builder persistence.');
        }
        $beUser = GeneralUtility::makeInstance(BackendUserAuthentication::class);
        $beUser->setBeUserByUid((int)$row['uid']);
        $beUser->fetchGroupData();
        $GLOBALS['BE_USER'] = $beUser;
    }
}
