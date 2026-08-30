export type ImportDocument = {
    documentId: string;
    source: string;
    text: string;
    assetId: string;
    name: string;
    mimeType: string;
    page: number;
    visualAssetIds?: string[];
};

export type AnalyzedQuestion = {
    questionNo?: string;
    material?: string;
    materialGroupId?: string;
    sourceDocumentIds?: string[];
    materialDocumentIds?: string[];
    visualRegions?: Array<{ documentId: string; kind?: string; bbox: { x: number; y: number; width: number; height: number }; caption?: string }>;
    [key: string]: unknown;
};

export type MaterialRange = {
    id: string;
    start: number;
    end: number;
    documentIds: string[];
};

export function extractMaterialRanges(text: string) {
    const normalized = text.replace(/\s+/g, ' ');
    const broad = /(?:回答|作答)\s*(\d{1,3})\s*(?:[~～—–－-]|至)\s*(\d{1,3})\s*题/g;
    const ranges: Array<{ start: number; end: number }> = [];
    for (const match of normalized.matchAll(broad)) {
        const start = Number(match[1]), end = Number(match[2]);
        if (start > 0 && end >= start && end - start <= 20)
            ranges.push({ start, end });
    }
    return ranges;
}

export function buildMaterialRanges(documents: ImportDocument[]): MaterialRange[] {
    const starts: Array<{ documentIndex: number; start: number; end: number }> = [];
    documents.forEach((document, documentIndex) => {
        extractMaterialRanges(document.text).forEach(range => starts.push({ documentIndex, ...range }));
    });
    return starts.map((range, index) => {
        const nextDocumentIndex = starts[index + 1]?.documentIndex ?? documents.length;
        const last = nextDocumentIndex === range.documentIndex ? range.documentIndex + 1 : nextDocumentIndex;
        return {
            id: `material-${range.start}-${range.end}-${index + 1}`,
            start: range.start,
            end: range.end,
            documentIds: documents.slice(range.documentIndex, last).map(document => document.documentId),
        };
    });
}

function questionNumber(value?: string) {
    const match = String(value || '').match(/\d{1,3}/);
    return match ? Number(match[0]) : undefined;
}

function unique(values: Array<string | undefined>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/**
 * The printed question range is authoritative. Model group labels are only used
 * when the paper contains no explicit “回答 6～10 题” marker.
 */
export function normalizeQuestionGroups<T extends AnalyzedQuestion>(documents: ImportDocument[], questions: T[]): Array<T & {
    materialGroupId?: string;
    materialDocumentIds: string[];
    sourceDocumentIds: string[];
}> {
    const ranges = buildMaterialRanges(documents);
    return questions.map((question, index) => {
        const number = questionNumber(question.questionNo);
        const range = number === undefined ? undefined : ranges.find(item => number >= item.start && number <= item.end);
        const modelMaterialIds = unique(question.materialDocumentIds || []);
        const allowedIds = new Set(range?.documentIds || documents.map(document => document.documentId));
        const modelSourceIds = unique(question.sourceDocumentIds || []).filter(id => allowedIds.has(id));
        const inferredSource = number === undefined ? undefined : documents.find(document => new RegExp(`(?:^|\\n)\\s*${number}[.．、]\\s*(?=[^\\d\\s%])`, 'm').test(document.text))?.documentId;
        const materialDocumentIds = range?.documentIds.length ? range.documentIds : modelMaterialIds;
        const hasMaterial = Boolean(String(question.material || '').trim()) || Boolean(range);
        const materialGroupId = hasMaterial
            ? (range?.id || String(question.materialGroupId || `material-model-${index + 1}`))
            : undefined;
        const rangeText = range ? range.documentIds.map(id => documents.find(document => document.documentId === id)?.text || '').join('\n\n') : '';
        const firstQuestion = range ? new RegExp(`(?:^|\\n)\\s*${range.start}[.．、]\\s*(?=[^\\d\\s%])`, 'm').exec(rangeText) : undefined;
        const material = range ? (firstQuestion ? rangeText.slice(0, firstQuestion.index) : rangeText).trim() : question.material;
        const sourceDocumentIds = modelSourceIds.length ? modelSourceIds : unique([inferredSource, ...materialDocumentIds]);
        return {
            ...question,
            material,
            materialGroupId,
            materialDocumentIds,
            sourceDocumentIds,
        };
    });
}

export function visualRefsForQuestion(documents: ImportDocument[], question: AnalyzedQuestion): Array<{
    assetId: string;
    documentId: string;
    name: string;
    mimeType: string;
    page: number;
    kind: 'source-image' | 'page-image' | 'chart-image';
    fallbackAssetId?: string;
}> {
    const ids = unique([...(question.materialDocumentIds || []), ...(question.sourceDocumentIds || [])]);
    const refs: ReturnType<typeof visualRefsForQuestion> = [];
    ids.map(id => documents.find(document => document.documentId === id)).filter((document): document is ImportDocument => Boolean(document)).forEach(document => {
        if (document.visualAssetIds?.length) {
            document.visualAssetIds.forEach((assetId, index) => refs.push({ assetId, documentId: `${document.documentId}-visual-${index + 1}`, name: `${document.name} · 图表 ${index + 1}`, mimeType: 'image/png', page: document.page, kind: 'chart-image', fallbackAssetId: document.assetId }));
        } else {
            refs.push({ assetId: document.assetId, documentId: document.documentId, name: document.name, mimeType: document.mimeType, page: document.page, kind: document.mimeType === 'application/pdf' ? 'page-image' : 'source-image' });
        }
    });
    return refs;
}

function splitOptions(block: string) {
    const optionPattern = /(?:^|\n|\s)([A-D])[.．、]\s*/g;
    const matches = [...block.matchAll(optionPattern)];
    if (!matches.length)
        return { stem: block.trim(), options: [] as string[] };
    const stem = block.slice(0, matches[0].index).trim();
    const options = matches.map((match, index) => {
        const start = (match.index || 0) + match[0].length;
        const end = matches[index + 1]?.index ?? block.length;
        return block.slice(start, end).trim();
    });
    return { stem, options };
}

/** A no-AI safety net: recognized questions must not disappear when the LLM is unavailable. */
export function fallbackAnalyzeDocuments(documents: ImportDocument[]) {
    const ranges = buildMaterialRanges(documents);
    const materialByRange = new Map(ranges.map(range => {
        const text = range.documentIds.map(id => documents.find(document => document.documentId === id)?.text || '').join('\n\n');
        const firstQuestion = new RegExp(`(?:^|\\n)\\s*${range.start}[.．、]\\s*`, 'm').exec(text);
        return [range.id, (firstQuestion ? text.slice(0, firstQuestion.index) : text).trim()] as const;
    }));
    const questions: Array<AnalyzedQuestion & { stem: string; options: string[]; answer: string; explanation: string; section: string; type: string }> = [];
    for (const document of documents) {
        const originalNumberText = /原题号\s*[:：]\s*([^\n]+)/.exec(document.text)?.[1] || '';
        const originalNumbers = [...originalNumberText.matchAll(/\d{1,3}/g)].map(match => Number(match[0])).filter(number => number > 0 && number <= 200);
        const rangedNumbers = extractMaterialRanges(document.text).flatMap(range => Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index));
        const expectedNumbers = new Set(originalNumbers.length ? originalNumbers : rangedNumbers);
        const matches = [...document.text.matchAll(/(?:^|\n|\s)(\d{1,3})\s*[.．、]\s*(?=[^\d\s%])/gm)].filter(match => {
            const number = Number(match[1]);
            return number > 0 && number <= 200 && (!expectedNumbers.size || expectedNumbers.has(number));
        });
        matches.forEach((match, index) => {
            const number = Number(match[1]);
            const start = (match.index || 0) + match[0].length;
            const end = matches[index + 1]?.index ?? document.text.length;
            const rawBlock = document.text.slice(start, end).trim();
            const parsed = splitOptions(rawBlock);
            if (!parsed.stem || parsed.stem.length < 4)
                return;
            const range = ranges.find(item => number >= item.start && number <= item.end);
            questions.push({
                questionNo: String(number),
                materialGroupId: range?.id,
                material: range ? materialByRange.get(range.id) || '' : '',
                materialDocumentIds: range?.documentIds || [],
                sourceDocumentIds: [document.documentId],
                stem: parsed.stem,
                options: parsed.options.slice(0, 4),
                answer: '',
                explanation: 'AI 拆题暂不可用，已根据题号和选项保留 OCR 结果，请在导入校对中确认。',
                section: range ? '资料分析' : '判断推理',
                type: parsed.options.length ? '待分类' : '图形推理／待分类',
            });
        });
    }
    const seen = new Set<string>();
    return normalizeQuestionGroups(documents, questions.filter(question => {
        const key = `${question.questionNo}:${question.sourceDocumentIds?.[0]}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    }));
}
