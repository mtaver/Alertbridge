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

export function generatePublicSummary({ category, affectedArea = '', happeningNow = '', anyoneInjured = '' }: PublicSummaryAnswers, language: 'en' | 'ha' = 'en') {
  if (!category) return ''
  const area = affectedArea.trim()
  if (language === 'ha') {
    const categoryText: Record<Category, string> = { 'Security threat': 'An kai rahoton barazanar tsaro', Flood: 'An kai rahoton ambaliya', Landslide: 'An kai rahoton zaftarewar ƙasa', Fire: 'An kai rahoton gobara', Other: 'An kai rahoton wani lamari na tsaron al’umma' }
    const sentences = [`${categoryText[category]}${area ? ` a ${area}` : ''}.`]
    if (happeningNow === 'Yes') sentences.push('An bayyana cewa yana faruwa yanzu.')
    else if (happeningNow === 'No') sentences.push('An bayyana cewa ba ya faruwa yanzu.')
    else if (happeningNow === 'Not sure') sentences.push('Ba a san ko yana faruwa yanzu ba.')
    if (anyoneInjured === 'Yes') sentences.push('Mai rahoto ya nuna cewa wani ya ji rauni.')
    else if (anyoneInjured === 'No') sentences.push('Mai rahoto ya nuna cewa ba a san wanda ya ji rauni ba.')
    else if (anyoneInjured === 'Not sure') sentences.push('Ba a san ko wani ya ji rauni ba.')
    return sentences.join(' ')
  }
  const sentences = [`${categorySentences[category]}${area ? ` in ${area}` : ''}.`]
  if (happeningNow === 'Yes') sentences.push('It is reported as happening now.')
  else if (happeningNow === 'No') sentences.push('It is reported as not happening now.')
  else if (happeningNow === 'Not sure') sentences.push('It is not known whether it is happening now.')
  if (anyoneInjured === 'Yes') sentences.push('The reporter indicated that someone is injured.')
  else if (anyoneInjured === 'No') sentences.push('The reporter indicated that no one is known to be injured.')
  else if (anyoneInjured === 'Not sure') sentences.push('It is not known whether anyone is injured.')
  return sentences.join(' ')
}
