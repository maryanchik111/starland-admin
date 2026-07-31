export const PERMISSIONS = [
  { code: 'users.read', category: 'users', description: 'Перегляд списку користувачів' },
  { code: 'users.write', category: 'users', description: 'Створення та редагування користувачів' },
  { code: 'roles.manage', category: 'users', description: 'Призначення ролей і видача дозволів' },
  { code: 'students.read', category: 'students', description: 'Перегляд карток учнів' },
  { code: 'students.write', category: 'students', description: 'Редагування карток учнів' },
  { code: 'health.read', category: 'students', description: 'Перегляд структурованих медичних даних' },
  { code: 'health_notes.read', category: 'students', description: 'Перегляд медичних нотаток' },
  { code: 'health.write', category: 'students', description: 'Редагування медичних даних' },
  { code: 'staff.read', category: 'staff', description: 'Перегляд карток персоналу' },
  { code: 'staff.write', category: 'staff', description: 'Редагування карток персоналу' },
  { code: 'classes.read', category: 'school', description: 'Перегляд класів' },
  { code: 'classes.write', category: 'school', description: 'Редагування класів і предметів' },
  { code: 'settings.manage', category: 'school', description: 'Налаштування школи' },
  { code: 'grades.write', category: 'grades', description: 'Виставлення оцінок' },
  { code: 'audit.read', category: 'system', description: 'Перегляд журналу аудиту' },
] as const

export type PermissionCode = (typeof PERMISSIONS)[number]['code']
