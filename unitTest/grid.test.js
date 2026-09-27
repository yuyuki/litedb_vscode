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
