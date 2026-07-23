// Replaces the Vue 2 global `dateFormatter` filter (filters are removed in Vue 3).
// Used directly in templates as {{ dateFormatter(entry.date) }}.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export function dateFormatter(inputDate: string | Date): string {
  const date = new Date(inputDate)
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}
