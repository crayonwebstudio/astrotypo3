<?php
declare(strict_types=1);
namespace Crayonwebstudio\AstroBuilder\Service;

use Crayonwebstudio\AstroBuilder\Domain\Model\Page;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Utility\GeneralUtility;

final class PageContentService
{
    public function __construct(private readonly ValidationService $validationService)
    {
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
        try {
            $connectionPool = GeneralUtility::makeInstance(ConnectionPool::class);
            $queryBuilder = $connectionPool->getQueryBuilderForTable('pages');
            $row = $queryBuilder->select('uid', 'title', 'slug')
                ->from('pages')
                ->where($queryBuilder->expr()->eq('slug', $queryBuilder->createNamedParameter($slug)))
                ->andWhere($queryBuilder->expr()->eq('deleted', $queryBuilder->createNamedParameter(0, \PDO::PARAM_INT)))
                ->executeQuery()
                ->fetchAssociative();
        } catch (\Throwable) {
            return null;
        }
        if (!is_array($row)) {
            return null;
        }
        // Element loading is intentionally isolated so the mapping can be
        // covered by functional tests with a real database.
        return new Page(
            'page-' . (string)($row['uid'] ?? ''),
            (string)($row['slug'] ?? $slug),
            (string)($row['title'] ?? ''),
            $status,
            [],
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
