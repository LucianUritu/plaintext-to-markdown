# Architecture

The application is split into browser, domain, publishing, and server layers.

## Browser layer

- `js/main.js` is the composition root. It wires controllers and services to DOM events.
- UI-specific behavior lives in focused controllers such as `BibliographyController`,
  `GitHubBooksController`, `PublishWorkflow`, and the version panels/modals.
- Conversion, rendering, validation, navigation, and API modules remain independent and
  directly testable.

## Domain layer

- `BookService` owns book use cases and mutations.
- `BookNormalizer` upgrades and repairs persisted/imported models.
- `CitationKeyGenerator` owns deterministic citation-key rules.
- `LocalBookRepository` owns browser persistence.
- `bookStorage.js` is a compatibility facade for existing callers.

Dependencies are injected into domain classes so tests can use deterministic IDs and
in-memory storage without browser globals.

## Publishing and server layers

- `TeachBooksGenerator` functions create repository files without network side effects.
- `PublishService` orchestrates publishing through an injected GitHub client.
- `HttpRouter`, `TeachBooksService`, `VersioningService`, and page URL strategies each
  own one server-side concern.

## Testing

- `npm test` runs the complete Node test suite.
- `npm run test:coverage` runs the suite with line, branch, and function coverage.
- `npm run test:watch` reruns affected tests during development.

Tests cover domain behavior, persistence, bibliography/citations, conversion, rendering,
validation, generation, publishing, GitHub integration boundaries, navigation, versioning,
routing, parsing, sessions, and user-facing error classification.
