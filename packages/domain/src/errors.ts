export class ForbiddenError extends Error {
  constructor(public readonly permissionCode: string) {
    super(`Forbidden: missing permission ${permissionCode}`)
    this.name = 'ForbiddenError'
  }
}

/** Requested action conflicts with current state (duplicate email, last active director role, self-revoke, ...). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

/** A referenced entity (role code, user id, ...) does not exist. */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`)
    this.name = 'NotFoundError'
  }
}
