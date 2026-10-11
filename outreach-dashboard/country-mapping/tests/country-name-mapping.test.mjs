import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function loadBrowserEngine() {
  const context = { window: {} };
  vm.createContext(context);
  context.COUNTRY_MARKET_DATA = Object.fromEntries(['阿联酋', '沙特', '巴林', '阿曼'].map(key => [key, { included: '纳入', score: 2.5 }]));
  vm.runInContext(fs.readFileSync(new URL('../web/outreach-engine.js', import.meta.url), 'utf8'), context);
  return context;
}

test('English GCC country names use unchanged source-table potential', () => {
  const context = loadBrowserEngine();
  for (const [english, sourceKey] of [
    ['United Arab Emirates', '阿联酋'], ['Saudi Arabia', '沙特'],
    ['Bahrain', '巴林'], ['Oman', '阿曼'],
  ]) {
    const score = country => context.OutreachEngine.calculateDevelopmentScore({ country, marketStatus: 'open' });
    assert.equal(score(english).components.market, score(sourceKey).components.market);
    assert.equal(score(english).components.market,
      Math.round((context.COUNTRY_MARKET_DATA[sourceKey].score * 3 + 10) * 100) / 100);
    assert.ok(score(english).total < 70, 'name mapping alone must not qualify a customer');
  }
});

test('unknown and excluded source rows still receive no market points', () => {
  const context = loadBrowserEngine();
  const score = country => context.OutreachEngine.calculateDevelopmentScore({ country, marketStatus: 'open' });
  assert.equal(score('unmapped-country').components.market, 0);
  context.COUNTRY_MARKET_DATA['沙特'].included = '排除';
  assert.equal(score('Saudi Arabia').components.market, 0);
});
