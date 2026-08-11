// Client-safe only: no import here may reach @starland/db (Prisma, DB
// credentials) or its module graph, directly or transitively, since 'use
// client' components import from this barrel and Next.js bundles a module's
// whole import graph for the browser. Server-only exports (e.g.
// loadEffectivePermissions) live in ./server instead.
export {
  EffectivePermissions,
  requirePermission,
  type EffectiveScope,
  type ScopeRef,
  type ScopeType,
} from './permissions'
export { ForbiddenError, ConflictError, NotFoundError } from './errors'
