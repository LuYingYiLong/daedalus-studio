# Renderer architecture

`src/renderer/src` uses a domain-first layout. The directory is intentionally
not a flat collection of components; an import boundary makes it clear where
runtime coordination ends and product behavior begins.

## Boundaries

- `app/` owns bootstrap, runtime event bridging, window-level composition, and
  cross-feature coordination. It may compose features, but new domain behavior
  should not be added here.
- `features/<domain>/` owns user-facing behavior for one domain. UI, domain
  state, pure helpers, and controllers live together. A controller belongs to
  the feature that owns the state it manages.
- `pages/` composes a route or window from features. It does not own transport
  calls or session lifecycle state.
- `components/` contains reusable visual primitives. It must not depend on a
  page, feature, or application lifecycle.
- `shared/` contains framework-neutral primitives, transport infrastructure,
  and generic hooks. It must not depend on app, page, or feature code.
- `api/` is the existing RPC adapter boundary. Feature controllers may call it;
  visual primitives and shared utilities may not.

## Dependency direction

```text
app  -> pages/features -> api/shared
pages -> features -> api/shared
components/shared -> generic libraries only
```

Feature-to-feature imports are allowed when the dependency is a stable public
feature contract (for example, the Composer using chat display parts). A
feature must not reach back into `app/` or `pages/`.

The Composer remains a cohesive product surface. Its plan/goal controller is
separated because it owns a distinct lifecycle, but Composer input, queueing,
attachments, and model controls are not split into artificial micro-components.

## Migration rule

When moving behavior, first move the implementation and update its owner
imports. Compatibility should be expressed through typed contracts or pure
helpers, not by leaving a second mutable implementation under `app/`. New
application code must use the feature-owned controller path.
