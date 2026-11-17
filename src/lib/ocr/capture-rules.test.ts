import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import rules from './capture-rules.json'

// 共享关键词与 Android 端 ShotRules.java 的数组必须一致
const JAVA = new URL(
  '../../../android/app/src/main/java/com/shijinran/money/capture/ShotRules.java',
  import.meta.url,
)

const PAIRS: Array<[keyof typeof rules, string]> = [
  ['amountKeys', 'AMOUNT_KEYS'],
  ['totalKeys', 'TOTAL_KEYS'],
  ['payContext', 'PAY_CONTEXT'],
  ['paymentSignals', 'PAY_SIGNALS'],
  ['merchantKeys', 'MERCHANT_KEYS'],
  ['strongSignals', 'STRONG_SIGNALS'],
  ['ownCard', 'OWN_CARD'],
  ['penaltyKeys', 'PENALTY_KEYS'],
  ['balanceKeys', 'BALANCE_KEYS'],
  ['incomeWords', 'INCOME_WORDS'],
]

function javaArray(source: string, name: string): string[] {
  const m = source.match(new RegExp('static final String\\[\\] ' + name + ' = \\{([^}]*)\\}'))
  if (!m) throw new Error('ShotRules.java 里找不到数组 ' + name)
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1])
}

describe('capture-rules 一致性', () => {
  const source = readFileSync(JAVA, 'utf8')
  for (const [jsonKey, javaName] of PAIRS) {
    it(jsonKey + ' 与 ' + javaName + ' 相同', () => {
      expect(javaArray(source, javaName)).toEqual(rules[jsonKey])
    })
  }
})
