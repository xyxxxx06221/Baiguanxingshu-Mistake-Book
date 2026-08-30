export type ImportReview = {
    section: string;
    reason: string;
    reflection: string;
};

type ImportCandidate = {
    id: number;
    status: string;
    section: string;
    answer?: string;
    reason?: string;
    reflection?: string;
};

type StoredAttempt = {
    questionId: number;
};

/**
 * The selected id list is the storage boundary. Even if a caller accidentally
 * passes every OCR candidate, unchecked questions can never enter the library.
 */
export function prepareSelectedImports<T extends ImportCandidate>(
    candidates: T[],
    selectedIds: number[],
    reviews: Record<number, ImportReview> = {},
): T[] {
    const selected = new Set(selectedIds);
    return candidates.filter(q => selected.has(q.id)).map(q => ({
        ...q,
        status: q.answer ? '待首次重做' : '待补答案',
        section: reviews[q.id]?.section || q.section,
        reason: reviews[q.id]?.reason || q.reason,
        reflection: reviews[q.id]?.reflection || q.reflection,
    }));
}

/** Remove records created by the retired “library pending review” workflow. */
export function withoutPendingReview<
    TQuestion extends { id: number; status: string },
    TAttempt extends StoredAttempt,
>(store: { questions: TQuestion[]; attempts: TAttempt[] }) {
    const questions = store.questions.filter(q => q.status !== '待校对');
    const questionIds = new Set(questions.map(q => q.id));
    return { questions, attempts: store.attempts.filter(a => questionIds.has(a.questionId)) };
}
