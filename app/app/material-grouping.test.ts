import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaterialRanges, fallbackAnalyzeDocuments, normalizeQuestionGroups, visualRefsForQuestion, type ImportDocument } from './material-grouping.ts';

const document = (documentId: string, text: string, page: number): ImportDocument => ({
    documentId,
    text,
    page,
    source: `试卷 第 ${page} 页`,
    assetId: 'paper-1',
    name: '试卷.pdf',
    mimeType: 'application/pdf',
});

test('separate printed question ranges become separate material groups', () => {
    const documents = [
        document('p1', '二、根据所给材料，回答6～10题。\n2016—2021年发展情况见下图。', 1),
        document('p2', '6. 下列说法正确的是', 2),
        document('p3', '四、根据所给材料，回答16—20题。\n表 2020年登记情况', 3),
        document('p4', '表格续页\n请回答16～20题', 4),
    ];

    const normalized = normalizeQuestionGroups(documents, [
        { questionNo: '6', material: '第一份材料' },
        { questionNo: '10', material: '第一份材料' },
        { questionNo: '16', material: '第二份材料' },
        { questionNo: '20', material: '第二份材料' },
    ]);

    assert.equal(normalized[0].materialGroupId, normalized[1].materialGroupId);
    assert.equal(normalized[2].materialGroupId, normalized[3].materialGroupId);
    assert.notEqual(normalized[0].materialGroupId, normalized[2].materialGroupId);
    assert.match(String(normalized[0].material), /2016—2021年/);
    assert.doesNotMatch(String(normalized[0].material), /2020年登记情况/);
    assert.match(String(normalized[2].material), /2020年登记情况/);
});

test('a continued table page stays attached to its range and visual references are deduplicated', () => {
    const documents = [
        document('p1', '根据所给材料，回答16-20题。\n表格上半页', 1),
        document('p2', '表格下半页\n16. 问题', 2),
    ];
    const [range] = buildMaterialRanges(documents);
    assert.deepEqual(range.documentIds, ['p1', 'p2']);

    const [question] = normalizeQuestionGroups(documents, [{
        questionNo: '16',
        material: '表格材料',
        sourceDocumentIds: ['p2'],
    }]);
    assert.deepEqual(visualRefsForQuestion(documents, question).map(item => item.documentId), ['p1', 'p2']);
});

test('a standalone graphic question does not join a material group', () => {
    const documents = [document('p1', '1. 请选择符合规律的图形', 1)];
    const [question] = normalizeQuestionGroups(documents, [{
        questionNo: '1',
        material: '',
        sourceDocumentIds: ['p1'],
    }]);
    assert.equal(question.materialGroupId, undefined);
    assert.deepEqual(visualRefsForQuestion(documents, question).map(item => item.documentId), ['p1']);
});

test('local fallback ignores decimal labels inside charts', () => {
    const documents = [document('p1', '回答6～10题\n38.3\n8.2\n7.4\n2016年\n图 业务收入发展情况', 1)];
    assert.deepEqual(fallbackAnalyzeDocuments(documents), []);
});

test('local fallback keeps real numbered questions and their printed material range', () => {
    const documents = [
        document('p1', '根据所给材料，回答6～10题。\n| 年份 | 收入 |\n| 2021 | 100 |', 1),
        document('p2', '6. 下列说法正确的是？\nA. 甲\nB. 乙\nC. 丙\nD. 丁\n7. 与上年相比，增长率为：\nA. 1%\nB. 2%\nC. 3%\nD. 4%', 2),
    ];
    const questions = fallbackAnalyzeDocuments(documents);
    assert.equal(questions.length, 2);
    assert.equal(questions[0].materialGroupId, questions[1].materialGroupId);
    assert.deepEqual(questions[0].options, ['甲', '乙', '丙', '丁']);
});

test('local fallback uses original-number headers and finds questions after inline OCR content', () => {
    const documents = [document('p1', '第一组 原题号：3、5\n根据材料回答1～5题\t3. 下列判断正确的是？\nA. 甲 B. 乙 C. 丙 D. 丁\n广告文字 38.3\n5．能够推出的是？ A. 一 B. 二 C. 三 D. 四', 1)];
    const questions = fallbackAnalyzeDocuments(documents);
    assert.deepEqual(questions.map(question => question.questionNo), ['3', '5']);
});
