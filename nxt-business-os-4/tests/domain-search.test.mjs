import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/app/api/public/domain-search/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ES2022}}).outputText;
const {POST} = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const request = (name, headers = {}) => new Request('https://nxt.test/api/public/domain-search', {
  method: 'POST', headers: {'Content-Type': 'application/json', origin: 'https://nxt.test', ...headers},
  body: JSON.stringify({name}),
});
const json = (body, status = 200) => Response.json(body, {status});

test('a ZISPA RDAP not-found response is available, while generic 404s and failures remain unconfirmed', async t => {
  for (const [response, expected] of [
    [json({rdapConformance: ['rdap_level_0'], errorCode: 404}, 404), 'available'],
    [new Response('Not found', {status: 404}), 'unconfirmed'],
    [json({errorCode: 404}, 404), 'unconfirmed'],
    [json({rdapConformance: ['rdap_level_0'], errorCode: 429}, 429), 'unconfirmed'],
  ]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    const result = await (await POST(request('test-name.co.zw'))).json();
    assert.equal(result.results[0].status, expected);
    t.mock.restoreAll();
  }
});

test('reports confirmed registry records as unavailable without returning owner or contact records', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({
    rdapConformance: ['rdap_level_0'], ldhName: 'EXAMPLE.CO.ZW', status: ['inactive'],
    notices: [{title: 'GlobalBlock'}], entities: [{email: 'owner@example.invalid'}],
  }));
  const result = await (await POST(request('Example.co.zw.'))).json();
  assert.deepEqual(result.results, [{domain: 'example.co.zw', status: 'unavailable', source: 'ZISPA'}]);
  assert.ok(!JSON.stringify(result).includes('owner@'));
});

test('a bare business name compares five extensions and preserves uncertain international answers', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.body]);
    if (url.includes('zispa')) return json({rdapConformance: ['rdap_level_0'], errorCode: 404}, 404);
    if (url.includes('/domains/search')) return json({results: [
      {domain: 'new-business.com', available: true},
      {domain: 'new-business.co.uk', available: false},
      {domain: 'new-business.co.za', available: false},
    ]});
    return json({rdapConformance: ['rdap_level_0'], objectClassName: 'domain', ldhName: 'new-business.co.uk'});
  });
  const result = await (await POST(request(' New Business '))).json();
  assert.deepEqual(result.results.map(r => [r.domain, r.status]), [
    ['new-business.co.zw', 'available'], ['new-business.com', 'available'],
    ['new-business.co.uk', 'unavailable'], ['new-business.co.com', 'unconfirmed'], ['new-business.co.za', 'unconfirmed'],
  ]);
  assert.deepEqual(JSON.parse(calls.find(c => c[0].includes('/domains/search'))[1]).domains,
    ['new-business.com', 'new-business.co.uk', 'new-business.co.com', 'new-business.co.za']);
});

test('an RDAP 404 alone never declares an international domain available', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('/domains/search')
    ? json({results: [{domain: 'example.com', available: false}]})
    : json({rdapConformance: ['rdap_level_0'], errorCode: 404}, 404));
  assert.equal((await (await POST(request('example.com'))).json()).results[0].status, 'unconfirmed');
});

test('provider errors and mismatched records cannot become available results', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('/domains/search')) return json({results: [{domain: 'wrong.com', available: true}]});
    throw new Error('upstream timeout');
  });
  const response = await POST(request('example.com'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].status, 'unconfirmed');
});

test('rejects malformed names, oversized requests and cross-site calls before any upstream lookup', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {throw new Error('must not run');});
  for (const name of ['https://evil.test/path', 'test@company.com', 'x..com', '-bad.co.zw', 'x'.repeat(64)+'.com', '', 10]) {
    assert.equal((await POST(request(name))).status, 400);
  }
  assert.equal((await POST(request('example.com', {origin: 'https://evil.test'}))).status, 403);
  assert.equal((await POST(request('example.com', {'content-length': '9000'}))).status, 413);
  assert.equal(fetch.mock.callCount(), 0);
});
