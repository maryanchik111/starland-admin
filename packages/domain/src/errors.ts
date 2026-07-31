export class ForbiddenError extends Error {
  constructor(public readonly permissionCode: string) {
    super(`Forbidden: missing permission ${permissionCode}`)
    this.name = 'ForbiddenError'
  }
}
