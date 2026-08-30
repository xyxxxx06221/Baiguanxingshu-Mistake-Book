import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSelectedImports, withoutPendingReview } from './import-logic.ts';

test('only checked OCR candidates enter the wrong-question library', () => {
    const candidates = [1, 2, 3].map(id => ({
        id,
        status: '识别候选',
        section: '资料分析',
        answer: 'A',
    }));

    const imported = prepareSelectedImports(candidates, [2], {
        2: { section: '数量关系', reason: '计算错误', reflection: '先列式再计算' },
    });

    assert.deepEqual(imported, [{
        id: 2,
        status: '待首次重做',
        section: '数量关系',
        answer: 'A',
        reason: '计算错误',
        reflection: '先列式再计算',
    }]);
});

test('candidate without a confirmed answer stays out of the practice queue', () => {
    const [question] = prepareSelectedImports([{ id: 7, status: '识别候选', section: '判断推理', answer: '' }], [7]);
    assert.equal(question.status, '待补答案');
});

test('retired pending-review questions and their attempts are removed', () => {
    const cleaned = withoutPendingReview({
        questions: [
            { id: 1, status: '待校对' },
            { id: 2, status: '学习中' },
        ],
        attempts: [{ questionId: 1 }, { questionId: 2 }],
    });

    assert.deepEqual(cleaned, {
        questions: [{ id: 2, status: '学习中' }],
        attempts: [{ questionId: 2 }],
    });
});
