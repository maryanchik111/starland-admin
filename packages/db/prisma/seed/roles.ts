import type { PermissionCode } from './permissions.js'

type ScopeKind = 'global' | 'own_teaching' | 'mentor_classes' | 'own_children' | 'self'

export const ROLES: Array<{
  code: string
  name: string
  permissions: Array<{ code: PermissionCode; scope: ScopeKind }>
}> = [
  {
    code: 'director',
    name: 'Директор',
    permissions: [
      { code: 'users.read', scope: 'global' },
      { code: 'users.write', scope: 'global' },
      { code: 'roles.manage', scope: 'global' },
      { code: 'students.read', scope: 'global' },
      { code: 'students.write', scope: 'global' },
      { code: 'health.read', scope: 'global' },
      { code: 'staff.read', scope: 'global' },
      { code: 'staff.write', scope: 'global' },
      { code: 'classes.read', scope: 'global' },
      { code: 'classes.write', scope: 'global' },
      { code: 'settings.manage', scope: 'global' },
      { code: 'audit.read', scope: 'global' },
    ],
  },
  {
    code: 'deputy_director',
    name: 'Заступник директора',
    permissions: [
      { code: 'users.read', scope: 'global' },
      { code: 'students.read', scope: 'global' },
      { code: 'students.write', scope: 'global' },
      { code: 'staff.read', scope: 'global' },
      { code: 'classes.read', scope: 'global' },
      { code: 'classes.write', scope: 'global' },
      { code: 'audit.read', scope: 'global' },
    ],
  },
  { code: 'admin', name: 'Адміністратор', permissions: [
    { code: 'users.read', scope: 'global' },
    { code: 'students.read', scope: 'global' },
    { code: 'students.write', scope: 'global' },
    { code: 'staff.read', scope: 'global' },
    { code: 'classes.read', scope: 'global' },
  ] },
  { code: 'secretary', name: 'Секретар', permissions: [
    { code: 'students.read', scope: 'global' },
    { code: 'students.write', scope: 'global' },
    { code: 'classes.read', scope: 'global' },
  ] },
  { code: 'teacher', name: 'Вчитель', permissions: [
    { code: 'students.read', scope: 'own_teaching' },
    { code: 'classes.read', scope: 'own_teaching' },
    { code: 'grades.write', scope: 'own_teaching' },
  ] },
  { code: 'mentor', name: 'Класний керівник', permissions: [
    { code: 'students.read', scope: 'mentor_classes' },
    { code: 'students.write', scope: 'mentor_classes' },
    { code: 'health.read', scope: 'mentor_classes' },
    { code: 'classes.read', scope: 'mentor_classes' },
  ] },
  { code: 'assistant', name: 'Асистент', permissions: [
    { code: 'students.read', scope: 'mentor_classes' },
    { code: 'classes.read', scope: 'mentor_classes' },
  ] },
  { code: 'psychologist', name: 'Психолог', permissions: [
    { code: 'students.read', scope: 'global' },
  ] },
  { code: 'speech_therapist', name: 'Логопед', permissions: [
    { code: 'students.read', scope: 'global' },
  ] },
  { code: 'nurse', name: 'Медсестра', permissions: [
    { code: 'students.read', scope: 'global' },
    { code: 'health.read', scope: 'global' },
    { code: 'health_notes.read', scope: 'global' },
    { code: 'health.write', scope: 'global' },
  ] },
  { code: 'developer', name: 'Розробник', permissions: [
    { code: 'audit.read', scope: 'global' },
  ] },
  { code: 'student_family', name: 'Родина учня', permissions: [
    { code: 'students.read', scope: 'own_children' },
  ] },
]
