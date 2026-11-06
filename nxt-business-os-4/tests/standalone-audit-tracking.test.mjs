import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const intake = readFileSync(new URL('../scripts/standalone/public-intake.js', import.meta.url), 'utf8');
const thanks = readFileSync(new URL('../scripts/standalone/thank-you.js', import.meta.url), 'utf8');
const receiptKey = 'nxt.audit.receipt.v1';

function formHarness({audit = true, ok = true, networkError = false, storageError = false, shortMessage = false, trap = ''} = {}) {
  let handler, reset = 0, posts = 0;
  const routes = [], storage = new Map(), status = {setAttribute() {}}, button = {disabled: false, textContent: 'Submit'};
  const values = {name: audit ? 'Free Audit Request' : 'Contact Request', contact_name: 'NXT QA', email_from: 'qa@example.invalid', phone: '0000000000', partner_name: 'Internal QA', website: trap};
  const details = {service: 'Website Audit', challenge: shortMessage ? 'short' : 'Internal test of the audit receipt.', contact_method: 'Email', industry: ''};
  const form = {
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return button;
      const field = selector.match(/^\[name="(.+)"\]$/)?.[1];
      const detail = selector.match(/^\[data-field="(.+)"\]$/)?.[1];
      return {value: field ? values[field] || '' : details[detail] || ''};
    },
    append() {}, addEventListener(type, fn) { if (type === 'submit') handler = fn; }, reset() { reset++; }
  };
  const context = {
    document: {getElementById: () => form, createElement: () => status},
    window: {location: {assign: route => routes.push(route)}},
    sessionStorage: {setItem(k, v) {if (storageError) throw Error('Storage blocked'); storage.set(k, v);}},
    fetch: async () => {posts++; if (networkError) throw Error('Offline'); return {ok};},
    AbortSignal, Date
  };
  vm.runInNewContext(intake, context);
  return {submit: () => handler({preventDefault() {}}), routes, storage, status, button, get reset() {return reset;}, get posts() {return posts;}};
}

test('audit redirects only after confirmed save and blocks a second click', async () => {
  const h = formHarness(); await h.submit(); await h.submit();
  assert.deepEqual(h.routes, ['/thank-you']); assert.equal(h.posts, 1); assert.equal(h.reset, 1);
  assert.equal(JSON.parse(h.storage.get(receiptKey)).tracked, false);
});
for (const [name, settings] of Object.entries({rejected: {ok: false}, offline: {networkError: true}})) {
  test(name + ' save retains form and creates no receipt or redirect', async () => {
    const h = formHarness(settings); await h.submit();
    assert.equal(h.reset, 0); assert.equal(h.storage.size, 0); assert.deepEqual(h.routes, []);
    assert.equal(h.button.disabled, false); assert.match(h.status.textContent, /could not confirm/i);
  });
}
for (const [name, settings] of Object.entries({invalid: {shortMessage: true}, honeypot: {trap: 'bot'}})) {
  test(name + ' submission never sends or redirects', async () => {
    const h = formHarness(settings); await h.submit(); assert.equal(h.posts, 0); assert.deepEqual(h.routes, []);
  });
}
test('ordinary contact enquiry retains its existing inline confirmation', async () => {
  const h = formHarness({audit: false}); await h.submit();
  assert.equal(h.reset, 1); assert.deepEqual(h.routes, []); assert.equal(h.storage.size, 0);
});
test('blocked receipt storage still displays a saved success without false tracking', async () => {
  const h = formHarness({storageError: true}); await h.submit();
  assert.equal(h.reset, 1); assert.deepEqual(h.routes, []); assert.match(h.status.textContent, /received/);
});

function pageHarness(receipt, storageError = false) {
  const storage = new Map(receipt == null ? [] : [[receiptKey, typeof receipt === 'string' ? receipt : JSON.stringify(receipt)]]);
  const nodes = {'audit-confirmation': {hidden: true}, 'audit-start': {hidden: false}};
  const scripts = [], window = {};
  const context = {
    sessionStorage: {getItem: k => storage.get(k), setItem(k,v) {if (storageError) throw Error('Blocked'); storage.set(k,v);}},
    document: {getElementById: id => nodes[id], createElement: () => ({}), head: {appendChild: s => scripts.push(s)}},
    window, Date
  };
  const run = () => vm.runInNewContext(thanks, context);
  return {run, scripts, window, nodes, storage};
}
test('confirmed receipt loads existing Google destinations exactly once across repeat page loads', () => {
  const h = pageHarness({submittedAt: Date.now(), tracked: false}); h.run(); h.run();
  assert.equal(h.scripts.length, 1); assert.equal(h.nodes['audit-confirmation'].hidden, false);
  assert.deepEqual(Array.from(h.window.dataLayer).filter(x => x[0] === 'config').map(x => x[1]), ['G-K5EMQ7FDDH', 'AW-18558377672']);
});
for (const [name, receipt] of Object.entries({direct: null, malformed: 'not-json', expired: {submittedAt: Date.now() - 1800001, tracked: false}, future: {submittedAt: Date.now() + 60000, tracked: false}, invalidTimestamp: {submittedAt: 'today', tracked: false}})) {
  test(name + ' visit sends no Google event', () => {
    const h = pageHarness(receipt); h.run(); assert.equal(h.scripts.length, 0); assert.equal(h.window.dataLayer, undefined);
    assert.equal(h.nodes['audit-confirmation'].hidden, true);
  });
}
test('consumed receipt shows confirmation without sending another page view', () => {
  const h = pageHarness({submittedAt: Date.now(), tracked: true}); h.run();
  assert.equal(h.scripts.length, 0); assert.equal(h.nodes['audit-confirmation'].hidden, false);
});
test('failed consume does not load Google', () => {
  const h = pageHarness({submittedAt: Date.now(), tracked: false}, true); h.run(); assert.equal(h.scripts.length, 0);
});
