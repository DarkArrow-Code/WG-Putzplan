import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractCode } from '../src/index.js'

test('deutscher Microsoft-Text', () => {
  assert.equal(extractCode('Microsoft-Konto\nSicherheitscode\nVerwenden Sie den folgenden Sicherheitscode: 4827193'), '4827193')
})

test('englischer Microsoft-Text', () => {
  assert.equal(extractCode('Please use the following security code: 552901'), '552901')
})

test('Fallback ohne Label', () => {
  assert.equal(extractCode('Ihr Code lautet\n 839201 \nGültig 10 Minuten'), '839201')
})

test('kein Code', () => {
  assert.equal(extractCode('Willkommen bei Outlook'), null)
})
