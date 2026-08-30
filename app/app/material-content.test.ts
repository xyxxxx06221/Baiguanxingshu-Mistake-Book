import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMaterialText } from './material-content.ts';

test('material text removes parser payloads and table transcription', () => {
    const input = '材料正文\n\n|年份|数值|\n|---|---|\n|2024|100|\n\n【图表解析】\n{"series":[1,2]}';
    const output = cleanMaterialText(input);
    assert.match(output, /材料正文/);
    assert.doesNotMatch(output, /2024|100|图表解析|series|---/);
});

test('material text removes html tables and questions appended by OCR', () => {
    const input = '材料说明文字。\n<table><tr><td>指标</td><td>18138</td></tr></table>\n2021年居民收入继续增长。 请回答1～5题1. 2017～2021年间比值最小的是： A. 2018年';
    const output = cleanMaterialText(input);
    assert.equal(output, '材料说明文字。\n\n2021年居民收入继续增长。');
    assert.doesNotMatch(output, /table|td|2017～2021|A\./);
});
