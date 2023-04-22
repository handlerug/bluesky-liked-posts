const relativeTimeFormat = new Intl.RelativeTimeFormat('en')

export function getRelativeDateString(date: Date) {
  const now = new Date()
  const diff = (date.getTime() - now.getTime()) / 1000
  let relativeDate
  if (Math.abs(diff) < 60) {
    relativeDate = relativeTimeFormat.format(Math.floor(diff), 'second')
  } else if (Math.abs(diff) < 60 * 60) {
    relativeDate = relativeTimeFormat.format(Math.floor(diff / 60), 'minute')
  } else if (Math.abs(diff) < 24 * 60 * 60) {
    relativeDate = relativeTimeFormat.format(Math.floor(diff / 60 / 60), 'hour')
  } else if (Math.abs(diff) < 30 * 24 * 60 * 60) {
    relativeDate = relativeTimeFormat.format(
      Math.floor(diff / 60 / 60 / 24),
      'day'
    )
  } else if (Math.abs(diff) < 365 * 24 * 60 * 60) {
    relativeDate = relativeTimeFormat.format(
      date.getMonth() - now.getMonth(),
      'month'
    )
  } else {
    relativeDate = relativeTimeFormat.format(
      date.getFullYear() - now.getFullYear(),
      'month'
    )
  }
  return relativeDate
}
