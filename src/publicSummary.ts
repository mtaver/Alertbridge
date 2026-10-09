import type { Answer, Category } from './types'

interface PublicSummaryAnswers {
  category: Category | ''
  affectedArea?: string
  happeningNow?: Answer | ''
  anyoneInjured?: Answer | ''
}

const categorySentences: Record<Category, string> = {
  'Security threat': 'A security threat has been reported',
  Flood: 'Flooding has been reported',
  Landslide: 'A landslide has been reported',
  Fire: 'A fire has been reported',
  Other: 'A community safety incident has been reported',
}

export function generatePublicSummary({ category, affectedArea = '', happeningNow = '', anyoneInjured = '' }: PublicSummaryAnswers) {
  if (!category) return ''
  const area = affectedArea.trim()
  const sentences = [`${categorySentences[category]}${area ? ` in ${area}` : ''}.`]
  if (happeningNow === 'Yes') sentences.push('It is reported as happening now.')
  else if (happeningNow === 'No') sentences.push('It is reported as not happening now.')
  else if (happeningNow === 'Not sure') sentences.push('It is not known whether it is happening now.')
  if (anyoneInjured === 'Yes') sentences.push('The reporter indicated that someone is injured.')
  else if (anyoneInjured === 'No') sentences.push('The reporter indicated that no one is known to be injured.')
  else if (anyoneInjured === 'Not sure') sentences.push('It is not known whether anyone is injured.')
  return sentences.join(' ')
}
