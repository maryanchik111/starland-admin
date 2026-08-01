export const SETTINGS = {
  'attendance.no_show_delay_minutes': {
    value: 15,
    description: 'Скільки хвилин після початку першого уроку чекати перед сповіщенням «не прийшов»',
  },
  'attendance.state_reset_hour': {
    value: 3,
    description: 'Година щодобового скидання стану присутності',
  },
  'grades.edit_window_hours': {
    value: 48,
    description: 'Скільки годин вчитель може редагувати оцінку без окремого дозволу',
  },
  'retention.graduate_years': {
    value: 5,
    description: 'Скільки років зберігати дані випускника',
  },
  'moderation.reminder_hours': {
    value: 24,
    description: 'Через скільки годин нагадувати модератору про нерозглянутий коментар',
  },
} as const

export type SettingKey = keyof typeof SETTINGS
