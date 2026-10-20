<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

use Crayonwebstudio\AstroBuilder\Domain\Model\Page;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Utility\GeneralUtility;

final class PageContentService
{
    public function __construct(
        private readonly ValidationService $validationService,
        private readonly ContentElementMapper $elementMapper,
    ) {
    }

    /**
     * Canonical API slug form.
     *
     * TYPO3 stores page slugs with a leading slash (the site root page is
     * "/"), but API clients cannot send leading-slash slugs: Apache rejects
     * the encoded form (%2F) before PHP runs on the production stack. The
     * API therefore accepts the slug with or without slashes and normalizes
     * every accepted form to the stored form here, in one place:
     *
     *   ""        -> "/"   (root page)
     *   "home"    -> "/"   (root page, client alias)
     *   "/"       -> "/"   (root page)
     *   "about"   -> "/about"
     *   "/about"  -> "/about"
     *   "about/team" and "/about/team/" -> "/about/team"
     *
     * Preview tokens are minted and verified against this normalized slug,
     * so a token for the root page validates for "home", "" and "/" alike.
     */
    public static function normalizeSlug(string $slug): string
    {
        $trimmed = trim(trim($slug), '/');
        if ($trimmed === '' || $trimmed === 'home') {
            return '/';
        }
        return '/' . $trimmed;
    }

    public function findPublishedBySlug(string $slug): ?Page
    {
        return $this->findBySlug($slug, 'published');
    }

    public function findDraftBySlug(string $slug): ?Page
    {
        return $this->findBySlug($slug, 'draft');
    }

    /**
     * Production lookup against TYPO3 pages plus astro_builder elements.
     * Pages use the TYPO3 page record title and slug. Publication state is
     * never taken from the request: published queries require the published
     * workspace state, draft queries are only called after preview auth.
     */
    private function findBySlug(string $slug, string $status): ?Page
    {
        $slug = self::normalizeSlug($slug);
        try {
            $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
            $queryBuilder = $connectionPool->getQueryBuilderForTable('pages');
            // Restrictions are set explicitly: the TYPO3 default restriction
            // container silently excludes hidden pages, which is right for
            // published reads but breaks draft reads (draft pages are often
            // hidden until launch). Deleted is always excluded; published
            // additionally requires hidden = 0 in the where clause, draft
            // does not.
            $queryBuilder->getRestrictions()->removeAll()
                ->add(GeneralUtility::makeInstance(\TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction::class));
            $queryBuilder->select('uid', 'title', 'slug')
                ->from('pages')
                ->where($queryBuilder->expr()->eq('slug', $queryBuilder->createNamedParameter($slug)))
                ->andWhere($queryBuilder->expr()->eq('deleted', $queryBuilder->createNamedParameter(0, \TYPO3\CMS\Core\Database\Connection::PARAM_INT)));
            if ($status === 'published') {
                $queryBuilder->andWhere($queryBuilder->expr()->eq('hidden', $queryBuilder->createNamedParameter(0, \TYPO3\CMS\Core\Database\Connection::PARAM_INT)));
            }
            $row = $queryBuilder->executeQuery()->fetchAssociative();
        } catch (\Throwable) {
            return null;
        }
        if (!is_array($row)) {
            return null;
        }
        // Elements come from tt_content through the ContentElementMapper:
        // published reads hide hidden records, draft reads include them.
        $pageUid = (int)($row['uid'] ?? 0);
        $elements = $pageUid > 0 ? $this->elementMapper->elementsForPage($pageUid, $status === 'draft') : [];
        return new Page(
            'page-' . (string)($row['uid'] ?? ''),
            (string)($row['slug'] ?? $slug),
            (string)($row['title'] ?? ''),
            $status,
            $elements,
            [],
            'en',
        );
    }

    /** @return list<string> */
    public function validateForSave(Page $page): array
    {
        return $this->validationService->validatePage($page);
    }
}
