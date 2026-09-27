const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderCollectionGrid } = require('../out/utils/gridRenderer');
const { getLiteDbIdExpression } = require('../out/utils/stringUtils');

test('nested JSON is shortened and escaped for the webview', () => {
    const value = { text: '<img src=x onerror=alert(1)>', long: 'x'.repeat(100) };
    const html = renderCollectionGrid('test', {
        columns: ['_id', 'nested'], rows: [{ _id: { $oid: '0123456789abcdef01234567' }, nested: value }]
    });
    assert.match(html, /Open formatted JSON/);
    assert.match(html, /data-json="/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /data-id="\{&quot;\$oid&quot;:/);
    assert.match(html, /data-readonly="true" data-json=/);
});

test('document IDs retain their BSON or primitive type', () => {
    assert.equal(getLiteDbIdExpression('{"$oid":"0123456789abcdef01234567"}'), "ObjectId('0123456789abcdef01234567')");
    assert.equal(getLiteDbIdExpression('"0123456789abcdef01234567"'), "'0123456789abcdef01234567'");
    assert.equal(getLiteDbIdExpression('"123"'), "'123'");
    assert.equal(getLiteDbIdExpression('123'), '123');
    assert.throws(() => getLiteDbIdExpression('{"$oid":"invalid"}'));
});

test('JSON text uses a short preview while ordinary text remains editable', () => {
    const json = JSON.stringify({ message: 'x'.repeat(200) });
    const html = renderCollectionGrid('test', {
        columns: ['payload', 'plain'], rows: [{ payload: json, plain: 'hello' }]
    });
    assert.match(html, /data-type="json" data-readonly="true" data-json=/);
    assert.match(html, /class="json-link"/);
    assert.match(html, /data-col="plain"[^>]*>hello<\/td>/);
    assert.doesNotMatch(html, /<button[^>]*>\{&quot;message&quot;:.*x{200}/);
});

test('collection names are safe JavaScript values in the grid webview', () => {
    const name = "O'Reilly </script>";
    const html = renderCollectionGrid(name, { columns: ['name'], rows: [{ name: 'John' }] });
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    assert.doesNotMatch(script, /O'Reilly <\/script>/);
    assert.doesNotThrow(() => new Function(script));
    assert.match(script, /collection: "O'Reilly \\u003c\/script>"/);
});
