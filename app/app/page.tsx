'use client';
import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { prepareSelectedImports, withoutPendingReview } from './import-logic';
import { normalizeQuestionGroups, visualRefsForQuestion, type ImportDocument } from './material-grouping';
import { cleanMaterialText } from './material-content';
import { cropVisualAsset, loadVisualAsset, renderPdfPages, saveVisualAsset, visualAssetToDataUrl, type VisualRef } from './visual-assets';
import PercentFractionPractice from './percent-fraction';
type Question = {
    id: number;
    questionNo?: string;
    stem: string;
    material?: string;
    groupId?: string;
    visualRefs?: VisualRef[];
    options: string[];
    answer: string;
    answerSource: string;
    section: string;
    type: string;
    status: string;
    favorite: boolean;
    important: boolean;
    due: string;
    attempts: number;
    wrong: number;
    explanation: string;
    source: string;
    reason?: string;
    reflection?: string;
};
type Attempt = {
    id: number;
    questionId: number;
    selected: string;
    correct: boolean;
    certainty: string;
    reason?: string;
    reflection?: string;
    date: string;
};
type Store = {
    questions: Question[];
    attempts: Attempt[];
};
type ImportJob = { name: string; progress: number; status: 'idle' | 'running' | 'success' | 'error' };
type ImportLog = { id: number; time: string; level: 'info' | 'success' | 'warning' | 'error'; message: string; detail?: string };
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const seed: Store = { questions: [
        { id: 1, stem: '根据《中华人民共和国民法典》，下列关于民事法律行为效力的说法，正确的是：', options: ['无民事行为能力人实施的民事法律行为一律有效', '行为人与相对人以虚假意思表示实施的民事法律行为无效', '限制民事行为能力人实施的民事法律行为一律无效', '显失公平的民事法律行为自始无效'], answer: 'B', answerSource: '官方答案', section: '常识判断', type: '法律', status: '学习中', favorite: true, important: false, due: today(), attempts: 2, wrong: 1, explanation: '以虚假的意思表示实施的民事法律行为无效；隐藏行为的效力依照有关法律规定处理。', source: '2025 国考模拟卷 · 第 3 题' },
        { id: 2, stem: '某单位共有 48 人参加两项培训，参加甲培训的有 32 人，参加乙培训的有 28 人，两项都参加的有多少人？', options: ['8 人', '10 人', '12 人', '14 人'], answer: 'C', answerSource: '用户确认', section: '数量关系', type: '数学运算', status: '待首次重做', favorite: false, important: true, due: today(), attempts: 1, wrong: 1, explanation: '根据容斥原理：32 + 28 − 48 = 12。', source: '题本篇 · 第 16 页 · 第 42 题', reason: '方法选择错误' },
        { id: 3, stem: '“所有的创新都伴随风险”与下列哪项命题在逻辑上等价？', options: ['没有风险就没有创新', '有风险就一定有创新', '没有创新就没有风险', '所有风险都源于创新'], answer: 'A', answerSource: '官方答案', section: '判断推理', type: '逻辑判断', status: '学习中', favorite: false, important: true, due: today(), attempts: 3, wrong: 2, explanation: '“创新→风险”的逆否命题是“非风险→非创新”。', source: '2024 联考真题 · 第 77 题', reason: '推理链错误' },
        { id: 4, stem: '某地区 2025 年上半年生产总值为 1200 亿元，同比增长 8%，则上年同期约为多少亿元？', options: ['1080', '1111', '1125', '1176'], answer: 'B', answerSource: 'AI 生成·已确认', section: '资料分析', type: '综合型', status: '已掌握', favorite: true, important: false, due: addDays(20), attempts: 4, wrong: 1, explanation: '基期量 = 现期量 ÷ (1+增长率) = 1200÷1.08 ≈ 1111。', source: '题本篇 · 第 22 页 · 第 88 题', reason: '基期现期混淆' },
        { id: 5, stem: '依次填入画横线部分最恰当的一项是：真正的阅读，应当让思想在文字间自由地____，而不是停留在信息的表层。', options: ['游弋', '徘徊', '迁徙', '漂泊'], answer: 'A', answerSource: 'AI 推测·未确认', section: '言语理解与表达', type: '逻辑填空', status: '待补答案', favorite: false, important: false, due: addDays(1), attempts: 0, wrong: 0, explanation: '“游弋”与思想、文字间的自由移动搭配更自然；答案仍待确认。', source: '手机照片 · 第 1 题' },
    ], attempts: [] };
const nav = [['今天', '⌂'], ['导入', '↥'], ['错题库', '▤'], ['练习', '▶'], ['分析', '◫'], ['百化分', '%'], ['设置', '⚙']];
const reasons = ['知识缺失', '知识混淆', '审题错误', '信息提取错误', '推理链错误', '方法选择错误', '计算错误', '选项辨析错误', '时间不足／节奏失控', '作答操作错误', '猜题失误', '题目或答案存疑'];
const sections = ['常识判断', '政治理论', '言语理解与表达', '判断推理', '数量关系', '资料分析'];
const sectionReasons: Record<string, string[]> = {
    '资料分析': ['审题错误', '信息提取错误', '基期现期混淆', '公式选择错误', '计算错误', '估算误差过大', '时间不足／节奏失控'],
    '数量关系': ['不能理解题目', '不会做／无思路', '公式不懂', '方法选择错误', '建模错误', '计算错误', '时间不足／节奏失控'],
    '判断推理': ['规则不熟悉', '条件翻译错误', '推理链错误', '图形规律遗漏', '定义要点漏看', '选项辨析错误'],
    '言语理解与表达': ['主旨判断错误', '关键信息遗漏', '逻辑关系误判', '词义辨析错误', '语境理解偏差', '过度推断'],
    '政治理论': ['不熟悉原理', '概念混淆', '不知道具体事件', '政策表述记忆错误', '时政知识缺失', '选项辨析错误'],
    '常识判断': ['知识盲区', '不熟悉原理', '不知道具体事件', '记忆混淆', '时间线错误', '选项辨析错误']
};
const reasonsFor = (section: string) => sectionReasons[section] || reasons;
const responseJson = async <T,>(response: Response) => { const text = await response.text(); try { return JSON.parse(text) as T; } catch { throw new Error(`服务返回了无法解析的内容（HTTP ${response.status}）：${text.slice(0, 180)}`); } };
const normalizedOptions = (value: unknown) => { const options = Array.isArray(value) ? value.slice(0, 4).map(String).filter(Boolean) : []; return [0, 1, 2, 3].map(index => options[index] || `选项 ${'ABCD'[index]}（见原图／待校对）`); };
const materialGroupLabel = (question: Question) => { const range = question.groupId?.match(/material-(\d+)-(\d+)/); return range ? `材料 ${range[1]}–${range[2]} 题` : question.groupId ? '独立材料组' : ''; };
export default function Home() {
    const [store, setStore] = useState<Store>(seed), [tab, setTab] = useState('今天'), [query, setQuery] = useState(''), [filter, setFilter] = useState('全部');
    const [practiceId, setPracticeId] = useState<number | null>(null), [selected, setSelected] = useState(''), [certainty, setCertainty] = useState('确定'), [submitted, setSubmitted] = useState(false), [reason, setReason] = useState(''), [reflection, setReflection] = useState('');
    const [toast, setToast] = useState(''), [job, setJob] = useState<ImportJob | null>(null), [importFilesList, setImportFilesList] = useState<File[]>([]), [editing, setEditing] = useState<Question | null>(null);
    const [importLogs, setImportLogs] = useState<ImportLog[]>(() => { if (typeof window === 'undefined') return []; try { return JSON.parse(localStorage.getItem('xct-import-logs') || '[]'); } catch { return []; } });
    const restoreRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const raw = localStorage.getItem('xct-store-v1');
        if (raw)
            try {
                const saved = JSON.parse(raw) as Store;
                // Local persistence is intentionally hydrated after mount.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setStore(withoutPendingReview(saved));
            }
            catch { }
    }, []);
    useEffect(() => { localStorage.setItem('xct-store-v1', JSON.stringify(store)); }, [store]);
    useEffect(() => { localStorage.setItem('xct-import-logs', JSON.stringify(importLogs.slice(-120))); }, [importLogs]);
    useEffect(() => {
        if (!toast)
            return;
        const t = setTimeout(() => setToast(''), 2400);
        return () => clearTimeout(t);
    }, [toast]);
    useEffect(() => {
        const bulk = (event: Event) => {
            const { ids, action } = (event as CustomEvent<{
                ids: number[];
                action: string;
            }>).detail;
            const idSet = new Set(ids);
            if (action === 'delete') {
                setStore(s => ({ ...s, questions: s.questions.filter(q => !idSet.has(q.id)), attempts: s.attempts.filter(a => !idSet.has(a.questionId)) }));
            }
            else
                setStore(s => ({ ...s, questions: s.questions.map(q => !idSet.has(q.id) ? q : action === 'favorite' ? { ...q, favorite: true } : action === 'important' ? { ...q, important: true } : action === 'practice' ? { ...q, status: '学习中', due: today() } : action === 'archive' ? { ...q, status: '已归档' } : q) }));
            setToast(action === 'delete' ? `已删除 ${ids.length} 道题` : `已批量处理 ${ids.length} 道题`);
        };
        window.addEventListener('bulk-question-action', bulk);
        return () => window.removeEventListener('bulk-question-action', bulk);
    }, []);
    useEffect(() => {
        const complete = (event: Event) => {
            const { items, reason } = (event as CustomEvent<{
                items: Array<{
                    id: number;
                    selected: string;
                }>;
                reason?: string;
            }>).detail;
            const ids = new Set(items.map(x => x.id));
            const now = new Date().toISOString();
            setStore(s => ({ ...s, attempts: [...s.attempts, ...items.map((x, i) => { const q = s.questions.find(q => q.id === x.id)!; return { id: Date.now() + i, questionId: x.id, selected: x.selected, correct: x.selected === q.answer, certainty: '确定', date: now }; })], questions: s.questions.map(q => {
                    if (!ids.has(q.id))
                        return q;
                    const item = items.find(x => x.id === q.id)!;
                    const correct = item.selected === q.answer;
                    return { ...q, attempts: q.attempts + 1, wrong: q.wrong + (correct ? 0 : 1), status: '学习中', due: addDays(correct ? 7 : 1), reason: reason || q.reason };
                }) }));
            setToast(`已完成 ${items.length} 道共享材料题`);
            setPracticeId(null);
            setTab('今天');
        };
        window.addEventListener('complete-material-group', complete);
        return () => window.removeEventListener('complete-material-group', complete);
    }, []);
    useEffect(() => {
        const review = (event: Event) => {
            const { ids, action, reviews, questions } = (event as CustomEvent<{
                ids: number[];
                action: 'confirm' | 'remove';
                reviews?: Record<number, { section: string; reason: string; reflection: string }>;
                questions?: Question[];
            }>).detail;
            if (action === 'confirm' && questions?.length) {
                const selectedQuestions = prepareSelectedImports(questions, ids, reviews);
                setStore(s => ({ ...s, questions: [...selectedQuestions, ...s.questions] }));
            }
            setToast(action === 'remove' ? `已移除 ${ids.length} 道识别结果` : `已确认 ${ids.length} 道题进入错题库`);
        };
        window.addEventListener('import-review-action', review);
        return () => window.removeEventListener('import-review-action', review);
    }, []);
    const due = store.questions.filter(q => q.due <= today() && q.status !== '已归档' && q.status !== '待补答案');
    const current = store.questions.find(q => q.id === practiceId) ?? null;
    const start = (id?: number) => {
        const q = id ?? due[0]?.id ?? store.questions[0]?.id;
        if (!q) {
            setToast('当前没有可练习题目');
            return;
        }
        setPracticeId(q);
        setSelected('');
        setSubmitted(false);
        setReason('');
        setReflection('');
        setTab('练习');
    };
    const submit = () => {
        if (!selected) {
            setToast('请先选择一个答案');
            return;
        }
        setSubmitted(true);
    };
    const finish = () => {
        if (!current)
            return;
        const correct = selected === current.answer;
        if (!correct && !reason) {
            setToast('答错后请选择主错因');
            return;
        }
        const interval = correct ? (certainty === '确定' ? 7 : 3) : 1;
        const attempt: Attempt = { id: Date.now(), questionId: current.id, selected, correct, certainty, reason: reason || undefined, reflection: reflection || undefined, date: new Date().toISOString() };
        setStore(s => ({ ...s, attempts: [...s.attempts, attempt], questions: s.questions.map(q => q.id === current.id ? { ...q, attempts: q.attempts + 1, wrong: q.wrong + (correct ? 0 : 1), status: correct && q.attempts >= 2 ? '已掌握' : '学习中', due: addDays(interval), important: q.important || (!correct && q.wrong >= 1), reason: reason || q.reason } : q) }));
        setToast(correct ? '已记录，7 天后再次验证' : '已回到复习池，明天再练');
        setPracticeId(null);
        setTab('今天');
    };
    const importFiles = (files: FileList | null) => {
        if (!files?.length)
            return;
        const list = Array.from(files);
        setImportFilesList(list);
        setJob({ name: list.length === 1 ? list[0].name : `${list.length} 个文件`, progress: 0, status: 'idle' });
        window.dispatchEvent(new CustomEvent('import-files-changed', { detail: list }));
    };
    useEffect(() => {
        const remove = (event: Event) => {
            const index = (event as CustomEvent<number>).detail;
            setImportFilesList(current => {
                const next = current.filter((_, i) => i !== index);
                setJob(next.length ? { name: next.length === 1 ? next[0].name : `${next.length} 个文件`, progress: 0, status: 'idle' } : null);
                window.dispatchEvent(new CustomEvent('import-files-changed', { detail: next }));
                return next;
            });
        };
        window.addEventListener('remove-import-file', remove);
        return () => window.removeEventListener('remove-import-file', remove);
    }, []);
    useEffect(() => {
        const zone = () => document.querySelector('.dropzone');
        const over = (event: DragEvent) => {
            if (!zone())
                return;
            event.preventDefault();
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = 'copy';
            zone()?.classList.add('drag-active');
        };
        const leave = (event: DragEvent) => {
            if (!zone())
                return;
            event.preventDefault();
            const related = event.relatedTarget as Node | null;
            if (!related || !zone()?.contains(related))
                zone()?.classList.remove('drag-active');
        };
        const drop = (event: DragEvent) => {
            if (!zone())
                return;
            event.preventDefault();
            zone()?.classList.remove('drag-active');
            const accepted = Array.from(event.dataTransfer?.files || []).filter(file => file.type === 'application/pdf' || /^(image\/(?:jpeg|png|gif|webp))$/i.test(file.type) || /\.(pdf|png|jpe?g|gif|webp)$/i.test(file.name));
            if (!accepted.length) {
                setToast('请拖入 PDF 或图片文件');
                return;
            }
            setImportFilesList(accepted);
            setJob({ name: accepted.length === 1 ? accepted[0].name : `${accepted.length} 个文件`, progress: 0, status: 'idle' });
            window.dispatchEvent(new CustomEvent('import-files-changed', { detail: accepted }));
            setToast(`已接收 ${accepted.length} 个文件`);
        };
        document.addEventListener('dragover', over);
        document.addEventListener('dragleave', leave);
        document.addEventListener('drop', drop);
        return () => { document.removeEventListener('dragover', over); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', drop); };
    }, []);
    const runImport = async () => {
        if (!job || !importFilesList.length)
            return;
        const addLog = (level: ImportLog['level'], message: string, detail?: string) => setImportLogs(current => [...current.slice(-119), { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), level, message, detail }]);
        const progress = (value: number) => setJob(current => current ? { ...current, progress: value, status: 'running' } : current);
        setImportLogs([]);
        setJob(current => current ? { ...current, progress: 2, status: 'running' } : current);
        addLog('info', '开始 DeepSeek 视觉导入', `${importFilesList.length} 个文件`);
        try {
            const saved = JSON.parse(localStorage.getItem('xct-api-settings') || '{}') as { deepseekKey?: string };
            sessionStorage.removeItem('xct-import-candidates');
            window.dispatchEvent(new CustomEvent('import-candidates-ready', { detail: [] }));
            addLog('info', '识别引擎', `DeepSeek deepseek-v4-flash-vision-exp · ${saved.deepseekKey ? '设置页凭证' : '应用环境凭证'}`);
            const documents: ImportDocument[] = [];
            const images: Array<{ documentId: string; name: string; page: number; dataUrl: string }> = [];
            for (const [fileIndex, file] of importFilesList.entries()) {
                const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
                if (!isPdf && !/^(image\/(?:jpeg|png|gif|webp))$/i.test(file.type))
                    throw new Error(`${file.name} 的格式不受 DeepSeek 视觉支持，请转换为 PNG、JPEG、GIF 或 WebP`);
                const sourceAssetId = `visual-${Date.now()}-${fileIndex}`;
                await saveVisualAsset({ id: sourceAssetId, name: file.name, mimeType: file.type || 'image/png', blob: file });
                if (isPdf) {
                    const pageCount = (await PDFDocument.load(await file.arrayBuffer())).getPageCount();
                    const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
                    addLog('info', `正在转换 PDF：${file.name}`, `${pageCount} 页将离线转换为 PNG；不会上传原始 PDF`);
                    const rendered = await renderPdfPages(file, sourceAssetId, pages);
                    for (const page of pages) {
                        const assetId = rendered.get(page);
                        if (!assetId) continue;
                        const documentId = `${sourceAssetId}-page-${page}`;
                        documents.push({ documentId, source: `${file.name} · 第 ${page} 页`, text: '', assetId, name: file.name, mimeType: 'image/png', page });
                        images.push({ documentId, name: file.name, page, dataUrl: await visualAssetToDataUrl(assetId) });
                    }
                    addLog('success', `${file.name} 已转换为题目页截图`, `${rendered.size} 页 PNG 已保存到本地素材库`);
                } else {
                    const documentId = `${sourceAssetId}-page-1`;
                    documents.push({ documentId, source: file.name, text: '', assetId: sourceAssetId, name: file.name, mimeType: file.type, page: 1 });
                    images.push({ documentId, name: file.name, page: 1, dataUrl: await visualAssetToDataUrl(sourceAssetId) });
                    addLog('success', `题目截图已保存：${file.name}`, `${(file.size / 1024 / 1024).toFixed(1)} MB · 本地原图`);
                }
                progress(8 + Math.round((fileIndex + 1) / importFilesList.length * 25));
            }
            if (!images.length)
                throw new Error('没有可供 DeepSeek 识别的题目图片');
            const estimatedBytes = images.reduce((sum, image) => sum + image.dataUrl.length * 0.75, 0);
            if (estimatedBytes > 44 * 1024 * 1024)
                throw new Error('图片总量超过 DeepSeek 单次请求限制，请分批导入（建议每次不超过 40 MB）');
            progress(38);
            addLog('info', 'DeepSeek 正在识别材料与题目', `${images.length} 张图片 · 同时提取可编辑正文、题目结构和图表坐标`);
            const analyzed = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images, apiKey: saved.deepseekKey }) });
            type VisionRegion = { documentId: string; kind?: string; bbox: { x: number; y: number; width: number; height: number }; caption?: string };
            type VisionQuestion = { questionNo?: string; material?: string; materialGroupId?: string; materialDocumentIds?: string[]; sourceDocumentIds?: string[]; stem: string; options: string[]; answer?: string; explanation?: string; section?: string; type?: string; visualRegions?: VisionRegion[] };
            const result = await responseJson<{ questions?: VisionQuestion[]; error?: string; analysisMode?: string; finishReason?: string }>(analyzed);
            if (!analyzed.ok || !result.questions?.length)
                throw new Error(result.error || 'DeepSeek 没有识别到完整题目，请上传包含材料、题干和选项的清晰截图');
            const unanswered = result.questions.filter(question => !/^[A-D]$/i.test(String(question.answer || ''))).length;
            if (unanswered)
                addLog('warning', '部分题目因截图残缺无法生成答案', `${unanswered} 道题将进入“待补答案”，请在导入校对中补充后再练习`);
            progress(76);
            const cropCache = new Map<string, string>();
            const allRegions = result.questions.flatMap(question => question.visualRegions || []);
            for (const [index, region] of allRegions.entries()) {
                const key = `${region.documentId}:${JSON.stringify(region.bbox)}`;
                if (cropCache.has(key)) continue;
                const document = documents.find(item => item.documentId === region.documentId);
                if (!document) continue;
                const outputId = `${region.documentId}-deepseek-region-${cropCache.size + 1}`;
                try {
                    await cropVisualAsset(document.assetId, outputId, region.bbox, region.caption || `${document.name} · 图表`);
                    cropCache.set(key, outputId);
                } catch (error) {
                    addLog('warning', `第 ${document.page} 页图表裁切失败`, error instanceof Error ? error.message : '将降级显示原题截图');
                }
                progress(76 + Math.round((index + 1) / Math.max(1, allRegions.length) * 12));
            }
            const normalized = normalizeQuestionGroups(documents, result.questions);
            const visionRefs = (question: VisionQuestion): VisualRef[] => {
                const refs = (question.visualRegions || []).reduce<VisualRef[]>((items, region, index) => {
                    const assetId = cropCache.get(`${region.documentId}:${JSON.stringify(region.bbox)}`);
                    const document = documents.find(item => item.documentId === region.documentId);
                    if (assetId && document) items.push({ assetId, documentId: `${region.documentId}-region-${index + 1}`, name: region.caption || `${document.name} · 图表`, mimeType: 'image/png', page: document.page, kind: 'chart-image', fallbackAssetId: document.assetId });
                    return items;
                }, []);
                return refs.length ? refs : visualRefsForQuestion(documents, question);
            };
            const stamp = Date.now();
            const qs: Question[] = normalized.map((x, i) => ({ id: stamp + i, questionNo: String(x.questionNo || i + 1), material: cleanMaterialText(x.material) || undefined, groupId: x.materialGroupId ? `${stamp}-${x.materialGroupId}` : undefined, visualRefs: visionRefs(x), stem: String(x.stem || ''), options: normalizedOptions(x.options), answer: String(x.answer || ''), answerSource: x.answer ? 'AI 推测·未确认' : '暂无答案', section: sections.includes(String(x.section || '')) ? String(x.section) : '资料分析', type: String(x.type || '待分类'), status: x.answer ? '待首次重做' : '待补答案', favorite: false, important: false, due: today(), attempts: 0, wrong: 0, explanation: String(x.explanation || ''), source: `${job.name} · 第 ${x.questionNo || i + 1} 题 · DeepSeek 视觉识别` }));
            const groups = new Map<string, string[]>();
            qs.forEach(question => { if (question.groupId) groups.set(materialGroupLabel(question), [...(groups.get(materialGroupLabel(question)) || []), question.questionNo || '']); });
            if (groups.size)
                addLog('success', '材料与题目分组完成', [...groups.entries()].map(([label, numbers]) => `${label}：${numbers.join('、')}`).join('；'));
            sessionStorage.setItem('xct-import-candidates', JSON.stringify(qs));
            window.dispatchEvent(new CustomEvent('import-candidates-ready', { detail: qs }));
            setJob(current => current ? { ...current, progress: 100, status: 'success' } : current);
            addLog('success', 'DeepSeek 视觉导入完成', `${qs.length} 道候选题 · ${cropCache.size} 个图表/图片区域；请进入校对确认`);
            setToast(`已识别并生成 ${qs.length} 道题`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'DeepSeek 视觉导入失败';
            setJob(current => current ? { ...current, status: 'error' } : current);
            addLog('error', '导入失败', message);
            setToast(message);
        }
    };
    const saveEdit = () => {
        if (!editing)
            return;
        const isImported = store.questions.some(q => q.id === editing.id);
        if (isImported)
            setStore(s => ({ ...s, questions: s.questions.map(q => q.id === editing.id ? editing : q) }));
        else {
            const candidates = JSON.parse(sessionStorage.getItem('xct-import-candidates') || '[]') as Question[];
            sessionStorage.setItem('xct-import-candidates', JSON.stringify(candidates.map(q => q.id === editing.id ? editing : q)));
            window.dispatchEvent(new CustomEvent('import-candidate-updated', { detail: editing }));
        }
        setEditing(null);
        setToast('题目修改已保存，历史作答未被覆盖');
    };
    const backup = () => { const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `百官行述备份_${today()}.json`; a.click(); URL.revokeObjectURL(a.href); setToast('完整备份已导出'); };
    const restore = (f: File) => {
        const r = new FileReader();
        r.onload = () => {
            try {
                const data = JSON.parse(String(r.result));
                if (!Array.isArray(data.questions) || !Array.isArray(data.attempts))
                    throw 0;
                setStore(withoutPendingReview(data));
                setToast('备份恢复成功');
            }
            catch {
                setToast('备份文件格式不正确');
            }
        };
        r.readAsText(f);
    };
    const editingImportCandidate = editing ? !store.questions.some(q => q.id === editing.id) : false;
    return <main className="app-shell"><div className="window-drag-region" aria-hidden="true"/><aside className="sidebar"><div className="brand"><span className="seal-mark"><img src="/baiguan-seal-logo.png" alt="百官行述印章"/></span><strong>百官行述</strong></div><nav>{nav.map(([name, icon]) => <button aria-label={name === '百化分' ? '百化分练习' : name} title={name === '百化分' ? '百化分练习' : name} onClick={() => setTab(name)} className={tab === name ? 'active' : ''} key={name}><i aria-hidden="true">{icon}</i><span className="nav-label">{name === '今天' ? '今日复习' : name === '导入' ? '导入题卷' : name === '练习' ? '专项练习' : name === '分析' ? '复盘分析' : name === '百化分' ? '百化分练习' : name}</span>{name === '今天' && due.length > 0 ? <b>{due.length}</b> : null}</button>)}</nav></aside><section className="workspace"><Top tab={tab} query={query} setQuery={setQuery}/>{tab === '今天' && <Today store={store} due={due} start={start}/>} {tab === '导入' && <ImportPage job={job} logs={importLogs} clearLogs={() => setImportLogs([])} onFiles={importFiles} edit={setEditing} run={runImport}/>} {tab === '错题库' && <Library questions={store.questions} query={query} filter={filter} setFilter={setFilter} edit={setEditing} start={start} toggle={(id, key) => setStore(s => ({ ...s, questions: s.questions.map(q => q.id === id ? { ...q, [key]: !q[key] } : q) }))}/>} {tab === '练习' && <Practice current={current} due={due} start={start} selected={selected} setSelected={setSelected} certainty={certainty} setCertainty={setCertainty} submitted={submitted} submit={submit} reason={reason} setReason={setReason} reflection={reflection} setReflection={setReflection} finish={finish}/>} {tab === '分析' && <Analytics store={store}/>} {tab === '百化分' && <PercentFractionPractice/>} {tab === '设置' && <Settings backup={backup} restoreRef={restoreRef} restore={restore} count={store.questions.length}/>}</section>{editing && <Editor q={editing} setQ={setEditing} close={() => setEditing(null)} save={saveEdit} importCandidate={editingImportCandidate}/>} {toast && <div className="toast">✓ {toast}</div>}</main>;
}
function Top({ tab, query, setQuery }: {
    tab: string;
    query: string;
    setQuery: (s: string) => void;
}) { const title = tab === '今天' ? '今日复习' : tab === '导入' ? '导入题卷' : tab === '练习' ? '专项练习' : tab === '分析' ? '复盘分析' : tab; return <header className="top"><div><p className="eyebrow">百官行述</p><h1>{title}</h1></div>{tab === '错题库' && <label className="search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索题干、解析或来源"/><kbd>⌘ K</kbd></label>}</header>; }
function Today({ store, due, start }: {
    store: Store;
    due: Question[];
    start: (id?: number) => void;
}) { const total = store.questions.length, mastered = store.questions.filter(q => q.status === '已掌握').length, unmastered = store.questions.filter(q => q.status !== '已掌握' && q.status !== '已归档').length; const attempts = store.questions.reduce((n, q) => n + q.attempts, 0) + store.attempts.length, wrong = store.questions.reduce((n, q) => n + q.wrong, 0), rate = attempts ? Math.round(Math.max(0, attempts - wrong) / attempts * 100) : 0; return <><section className="hero-card compact-hero"><div><p className="eyebrow light">今日计划</p><h2>{due.length} 道题等待复习</h2></div><button className="primary" onClick={() => start()}>开始今日复习 <span>→</span></button></section><div className="home-stats"><article><span>总错题数</span><strong>{total}</strong><small>已收录题目</small></article><article className="accent"><span>今日待做</span><strong>{due.length}</strong><small>按计划到期</small></article><article><span>已掌握</span><strong>{mastered}</strong><small>通过间隔验证</small></article><article><span>未掌握</span><strong>{unmastered}</strong><small>尚需继续复习</small></article><article><span>正确率</span><strong>{rate}%</strong><small>{attempts} 次作答</small></article></div></>; }
function ImportPage({ job, logs, clearLogs, onFiles, edit, run }: {
    job: ImportJob | null;
    logs: ImportLog[];
    clearLogs: () => void;
    onFiles: (f: FileList | null) => void;
    edit: (q: Question) => void;
    run: () => void;
}) {
    const [pending, setPending] = useState<Question[]>(() => {
        if (typeof window === 'undefined') return [];
        try { return JSON.parse(sessionStorage.getItem('xct-import-candidates') || '[]'); }
        catch { return []; }
    });
    const [selected, setSelected] = useState<number[]>([]);
    const [reviews, setReviews] = useState<Record<number, { section: string; reason: string; reflection: string }>>({});
    const [files, setFiles] = useState<File[]>([]);
    useEffect(() => {
        const changed = (event: Event) => setFiles((event as CustomEvent<File[]>).detail || []);
        const candidates = (event: Event) => {
            const next = (event as CustomEvent<Question[]>).detail || [];
            setPending(next);
            setSelected([]);
            setReviews({});
        };
        const updated = (event: Event) => setPending(current => current.map(q => q.id === (event as CustomEvent<Question>).detail.id ? (event as CustomEvent<Question>).detail : q));
        window.addEventListener('import-files-changed', changed);
        window.addEventListener('import-candidates-ready', candidates);
        window.addEventListener('import-candidate-updated', updated);
        return () => {
            window.removeEventListener('import-files-changed', changed);
            window.removeEventListener('import-candidates-ready', candidates);
            window.removeEventListener('import-candidate-updated', updated);
        };
    }, []);
    const updateReview = (id: number, patch: Partial<{ section: string; reason: string; reflection: string }>, fallbackSection: string) => setReviews(current => { const previous = current[id]; return { ...current, [id]: { section: patch.section ?? previous?.section ?? fallbackSection, reason: patch.reason ?? previous?.reason ?? '', reflection: patch.reflection ?? previous?.reflection ?? '' } }; });
    const ready = selected.length > 0 && selected.every(id => reviews[id]?.reason && reviews[id]?.reflection.trim());
    const act = (action: 'confirm' | 'remove') => {
        if (!selected.length)
            return;
        if (action === 'confirm' && !ready)
            return alert('请为每道勾选的错题选择错因，并写下一句话复盘');
        if (action === 'remove' && !confirm(`移除选中的 ${selected.length} 道题？`))
            return;
        const chosen = pending.filter(q => selected.includes(q.id));
        const remaining = pending.filter(q => !selected.includes(q.id));
        window.dispatchEvent(new CustomEvent('import-review-action', { detail: { ids: selected, action, reviews, questions: chosen } }));
        setPending(remaining);
        sessionStorage.setItem('xct-import-candidates', JSON.stringify(remaining));
        setSelected([]);
        if (action === 'confirm')
            setReviews({});
    };
    const preview = (q: Question) => q.material ? q.stem : q.stem.split(/\n\n+/).at(-1) || q.stem;
    return <>
        <section className="import-flow">
            <div className="import-step-card">
                <div className="step-label"><b>1</b><span><strong>上传截图或 PDF</strong><small>多个文件将按内容连续性合并分析</small></span></div>
                <label className={`dropzone ${job ? 'has-file' : ''}`}><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp" onChange={e => onFiles(e.target.files)}/><span className="upload-icon">↥</span><h2>{job ? job.name : '拖入 PDF 或题目截图'}</h2><p>{job ? '已接收文件，DeepSeek 将同时识别材料、题目和图表区域。' : '支持 PDF、PNG、JPEG、GIF、WebP；PDF 会先在本机转为图片。'}</p><b>{job ? '重新选择' : '选择文件'}</b></label>
                {files.length > 0 && <div className="import-file-list">{files.map((file, index) => <div key={`${file.name}-${index}`}><span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button title="删除这个文件" onClick={() => window.dispatchEvent(new CustomEvent('remove-import-file', { detail: index }))}>删除</button></div>)}</div>}
            </div>
            {job && <div className={`import-step-card target-card job-${job.status}`}><div className="step-label"><b>2</b><span><strong>图表、表格与题目结构识别</strong><small>三级结构化解析自动切换，DeepSeek 拆分材料组；任一步失败都会显示日志</small></span></div><button className="recognize" disabled={job.status === 'running'} onClick={run}>{job.status === 'running' ? `正在识别 ${job.progress}%` : job.status === 'error' ? '重新识别' : '识别全部内容并智能生成题目'}</button>{job.progress > 0 && <div className="progress"><i style={{ width: `${job.progress}%` }}/></div>}{job.status === 'error' && <p className="job-error">识别未完成，请展开下方日志查看具体错误。</p>}</div>}
        </section>
        {logs.length > 0 && <section className="import-log panel"><div className="import-log-head"><div><p className="eyebrow">诊断日志</p><h3>导入过程</h3></div><div><button onClick={() => navigator.clipboard.writeText(logs.map(log => `[${log.time}] ${log.level.toUpperCase()} ${log.message}${log.detail ? `\n  ${log.detail}` : ''}`).join('\n'))}>复制日志</button><button onClick={clearLogs}>清空</button></div></div><div className="import-log-list">{logs.map(log => <article className={`log-${log.level}`} key={log.id}><i/><time>{log.time}</time><div><strong>{log.message}</strong>{log.detail && <p>{log.detail}</p>}</div></article>)}</div></section>}
        <div className="panel import-review">
            <div className="panel-title"><div><p className="eyebrow">识别结果</p><h3>勾选可以进入错题库的题目</h3></div>{pending.length > 0 && <label><input type="checkbox" checked={selected.length === pending.length} onChange={() => setSelected(selected.length === pending.length ? [] : pending.map(q => q.id))}/>全选</label>}</div>
            {pending.map(q => <div className={`proof-item ${selected.includes(q.id) ? 'selected' : ''}`} key={q.id}><div className="proof-row selectable"><input type="checkbox" checked={selected.includes(q.id)} onChange={() => setSelected(s => s.includes(q.id) ? s.filter(id => id !== q.id) : [...s, q.id])}/><div className="proof-question" onClick={() => edit(q)}><div><strong>{q.source.split('· OCR')[0]}</strong><span>{reviews[q.id]?.section || q.section}</span></div><h4>{preview(q)}</h4><div className="proof-signals">{q.material && <small>共享材料已识别 · {q.material.length} 字</small>}{q.groupId && <small>{materialGroupLabel(q)}</small>}{q.visualRefs?.length ? <small>含 {q.visualRefs.length} 页原图／图表</small> : null}</div></div><button onClick={() => edit(q)}>查看</button></div>{selected.includes(q.id) && <div className="question-import-review"><label>所属板块<select value={reviews[q.id]?.section || q.section} onChange={e => updateReview(q.id, { section: e.target.value, reason: '' }, q.section)}>{sections.map(x => <option key={x}>{x}</option>)}</select></label><label>主要错因<select value={reviews[q.id]?.reason || ''} onChange={e => updateReview(q.id, { reason: e.target.value }, q.section)}><option value="">请选择</option>{reasonsFor(reviews[q.id]?.section || q.section).map(x => <option key={x}>{x}</option>)}</select></label><label className="reflection-field">一句话复盘<textarea value={reviews[q.id]?.reflection || ''} onChange={e => updateReview(q.id, { reflection: e.target.value }, q.section)} placeholder="这道题当时错在哪里？下次如何处理？"/></label></div>}</div>)}
            {!pending.length && <div className="empty">识别完成后，题目会在这里等待确认。</div>}
            {selected.length > 0 && <div className="review-actions"><button className="danger-text" onClick={() => act('remove')}>移除选中</button><button className="solid" disabled={!ready} onClick={() => act('confirm')}>确认 {selected.length} 道题进入错题库</button></div>}
        </div>
    </>;
}
function Library({ questions, query, filter, setFilter, edit, start, toggle }: {
    questions: Question[];
    query: string;
    filter: string;
    setFilter: (s: string) => void;
    edit: (q: Question) => void;
    start: (id: number) => void;
    toggle: (id: number, key: 'favorite' | 'important') => void;
}) {
    const [selected, setSelected] = useState<number[]>([]);
    const list = questions.filter(q => (filter === '全部' || q.status === filter || q.section === filter) && (q.stem + q.source + q.explanation).includes(query));
    const allSelected = list.length > 0 && list.every(q => selected.includes(q.id));
    const action = (name: string) => {
        if (!selected.length)
            return;
        if (name === 'delete' && !window.confirm(`确定删除选中的 ${selected.length} 道题及其作答记录吗？`))
            return;
        window.dispatchEvent(new CustomEvent('bulk-question-action', { detail: { ids: selected, action: name } }));
        setSelected([]);
    };
    return <><div className="filters">{['全部', '学习中', '待补答案', '已掌握', ...sections].map(x => <button className={filter === x ? 'on' : ''} onClick={() => { setFilter(x); setSelected([]); }} key={x}>{x}</button>)}</div><div className="bulk-bar"><label><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : list.map(q => q.id))}/><span>{selected.length ? `已选 ${selected.length} 道` : `选择当前 ${list.length} 道`}</span></label><div className={selected.length ? 'visible' : ''}><button onClick={() => action('favorite')}>☆ 收藏</button><button onClick={() => action('important')}>⚑ 标为重点</button><button onClick={() => action('practice')}>▶ 加入今日练习</button><button onClick={() => action('archive')}>▣ 归档</button><button className="danger" onClick={() => action('delete')}>删除</button></div></div><div className="library-head"><span>共 {list.length} 道题</span><select><option>按最近更新</option><option>按错误次数</option><option>按复习日期</option></select></div><div className="question-list">{list.map(q => <article className={`q-card ${selected.includes(q.id) ? 'selected' : ''}`} key={q.id}><label className="q-check"><input type="checkbox" checked={selected.includes(q.id)} onChange={() => setSelected(s => s.includes(q.id) ? s.filter(id => id !== q.id) : [...s, q.id])}/></label><div className="q-main"><div className="tags"><span>{q.section}</span><span>{q.type}</span><em className={q.answerSource.includes('未确认') || q.answerSource === '暂无答案' ? 'warn' : ''}>{q.answerSource}</em></div><h3>{q.stem}</h3><p>{q.source} · {q.attempts} 次作答 · {q.wrong} 次错误</p></div><div className="q-side"><span className={`state ${q.status}`}>{q.status}</span><div><button title="收藏" className={q.favorite ? 'marked' : ''} onClick={() => toggle(q.id, 'favorite')}>☆</button><button title="标记为重点题" className={`flag-icon ${q.important ? 'marked' : ''}`} onClick={() => toggle(q.id, 'important')}>⚑</button><button onClick={() => edit(q)}>编辑</button><button className="solid" onClick={() => start(q.id)}>重做</button></div></div></article>)}</div></>;
}
function usePracticeTimer(key: string) {
    const [seconds, setSeconds] = useState(0), [paused, setPaused] = useState(false);
    // A new question starts a new timer session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setSeconds(0); setPaused(false); }, [key]);
    useEffect(() => {
        if (paused)
            return;
        const timer = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(timer);
    }, [paused, key]);
    return { seconds, paused, setPaused };
}
function PracticeTimer({ value }: {
    value: ReturnType<typeof usePracticeTimer>;
}) { return <div className="timer"><span>◷ {String(Math.floor(value.seconds / 60)).padStart(2, '0')}:{String(value.seconds % 60).padStart(2, '0')}</span><button onClick={() => value.setPaused(!value.paused)}>{value.paused ? '继续' : '暂停'}</button></div>; }
function Markable({ id, text }: {
    id: string;
    text: string;
}) {
    type TextMark = {
        text: string;
        kind: 'underline' | 'highlight';
    };
    const key = `xct-marks:${id}`, root = useRef<HTMLDivElement>(null), hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null), [popup, setPopup] = useState<{
        text: string;
        left: number;
        top: number;
    } | null>(null), [marks, setMarks] = useState<TextMark[]>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(key) || '[]') as Array<string | TextMark>;
            return saved.map(x => typeof x === 'string' ? { text: x, kind: 'underline' as const } : x);
        }
        catch {
            return [];
        }
    });
    const dismissLater = () => {
        if (hideTimer.current)
            clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setPopup(null), 2400);
    };
    useEffect(() => () => {
        if (hideTimer.current)
            clearTimeout(hideTimer.current);
    }, []);
    const showActions = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
            return setPopup(null);
        const t = selection.toString().trim(), range = selection.getRangeAt(0);
        if (!t || !root.current?.contains(range.commonAncestorContainer))
            return setPopup(null);
        const rect = range.getBoundingClientRect();
        setPopup({ text: t, left: rect.left + rect.width / 2, top: Math.max(8, rect.top - 8) });
        dismissLater();
    };
    const save = (next: TextMark[]) => { setMarks(next); localStorage.setItem(key, JSON.stringify(next)); };
    const add = (kind: TextMark['kind']) => {
        const t = popup?.text.trim();
        if (t && !marks.some(m => m.text === t && m.kind === kind)) {
            const next = [...marks.filter(m => m.text !== t), { text: t, kind }];
            save(next);
        }
        setPopup(null);
        window.getSelection()?.removeAllRanges();
    };
    const remove = (target: TextMark) => save(marks.filter(m => !(m.text === target.text && m.kind === target.kind)));
    let nodes: Array<string | React.ReactElement> = [text];
    for (const item of marks)
        nodes = nodes.flatMap((node, i): Array<string | React.ReactElement> => typeof node === 'string' ? node.split(item.text).flatMap((part, j, all): Array<string | React.ReactElement> => j < all.length - 1 ? [part, <mark className={item.kind} title="点击清除这一条标记" onClick={() => remove(item)} key={`${i}-${j}-${item.kind}`}>{item.text}</mark>] : [part]) : [node]);
    return <div className="markable" ref={root} onMouseUp={showActions} onTouchEnd={showActions}><div>{nodes}</div>{popup && <div className="selection-toolbar" style={{ left: popup.left, top: popup.top }} onMouseEnter={() => {
                if (hideTimer.current)
                    clearTimeout(hideTimer.current);
            }} onMouseLeave={dismissLater}><button onMouseDown={e => e.preventDefault()} onClick={() => add('underline')}>划线</button><button onMouseDown={e => e.preventDefault()} onClick={() => add('highlight')}>高亮</button></div>}</div>;
}
function PracticeOptions({ q, value, onChange, submitted }: {
    q: Question;
    value: string;
    onChange: (v: string) => void;
    submitted: boolean;
}) {
    const [excluded, setExcluded] = useState<string[]>([]);
    return <div className="options smart-options">{q.options.map((o, i) => {
            const letter = 'ABCD'[i], out = excluded.includes(letter), correct = submitted && letter === q.answer, wrong = submitted && value === letter && letter !== q.answer;
            return <button disabled={submitted} className={`${value === letter ? 'chosen' : ''} ${out ? 'excluded' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`} onClick={() => {
                    if (!out)
                        onChange(letter);
                }} key={letter}><b title={out ? '点击恢复该选项' : '点击排除该选项'} onClick={e => {
                    e.stopPropagation();
                    if (submitted)
                        return;
                    setExcluded(s => s.includes(letter) ? s.filter(x => x !== letter) : [...s, letter]);
                    if (value === letter)
                        onChange('');
                }}>{out ? '×' : letter}</b><span>{o}</span></button>;
        })}</div>;
}
function VisualAssetView({ reference }: { reference: VisualRef }) {
    const [url, setUrl] = useState(''), [failed, setFailed] = useState(false);
    useEffect(() => {
        let objectUrl = '';
        // Reset stale preview state before resolving the new IndexedDB asset.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUrl('');
        setFailed(false);
        const load = async () => {
            let asset = await loadVisualAsset(reference.assetId) || (reference.fallbackAssetId ? await loadVisualAsset(reference.fallbackAssetId) : undefined);
            if (!asset)
                throw new Error('本地素材不存在');
            if (reference.mimeType === 'application/pdf') {
                const renderedId = `${reference.assetId}-rendered-page-${reference.page}`;
                const cached = await loadVisualAsset(renderedId);
                if (cached)
                    asset = cached;
                else {
                    const file = new File([asset.blob], asset.name, { type: 'application/pdf' });
                    await renderPdfPages(file, reference.assetId, [reference.page]);
                    asset = await loadVisualAsset(renderedId);
                    if (!asset)
                        throw new Error('PDF 页截图未生成');
                }
            }
            objectUrl = URL.createObjectURL(asset.blob);
            setUrl(objectUrl);
        };
        load().catch(() => setFailed(true));
        return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [reference.assetId, reference.fallbackAssetId, reference.mimeType, reference.name, reference.page]);
    if (!url)
        return <div className="visual-missing">{failed ? '题目截图生成失败，请在导入日志中查看原因' : '正在生成题目截图…'}</div>;
    return <img className="question-image" src={url} alt={`${reference.name} 原题图片`}/>;
}
function QuestionVisuals({ refs }: { refs?: VisualRef[] }) {
    if (!refs?.length)
        return null;
    const uniqueRefs = refs.filter((reference, index) => refs.findIndex(item => item.documentId === reference.documentId) === index);
    return <div className="question-visuals">{uniqueRefs.map(reference => <figure key={reference.documentId}><VisualAssetView reference={reference}/><figcaption>{reference.name}{reference.mimeType === 'application/pdf' ? ` · 第 ${reference.page} 页` : ''}</figcaption>{reference.kind === 'chart-image' && reference.fallbackAssetId ? <details className="visual-fallback"><summary>截图不完整？查看完整原题图</summary><VisualAssetView reference={{ ...reference, assetId: reference.fallbackAssetId, fallbackAssetId: undefined, kind: 'source-image', name: `${reference.name} · 完整原图` }}/></details> : null}</figure>)}</div>;
}
function Practice({ current, due, start, selected, setSelected, certainty, setCertainty, submitted, submit, reason, setReason, reflection, setReflection, finish }: {
    current: Question | null;
    due: Question[];
    start: (id?: number) => void;
    selected: string;
    setSelected: (s: string) => void;
    certainty: string;
    setCertainty: (s: string) => void;
    submitted: boolean;
    submit: () => void;
    reason: string;
    setReason: (s: string) => void;
    reflection: string;
    setReflection: (s: string) => void;
    finish: () => void;
}) {
    const timer = usePracticeTimer(String(current?.id || 'none'));
    if (!current)
        return <div className="practice-home"><div className="play">▶</div><h2>准备好开始练习了吗？</h2><button className="primary" onClick={() => start()}>开始练习</button></div>;
    const group = current.groupId ? due.filter(q => q.groupId === current.groupId).sort((a, b) => Number(a.questionNo || 0) - Number(b.questionNo || 0)) : [];
    if (group.length > 1)
        return <MaterialPractice questions={group} start={start} due={due}/>;
    const correct = selected === current.answer, nextQ = due.find(q => q.id !== current.id), previous = () => {
        const i = due.findIndex(q => q.id === current.id);
        if (i <= 0)
            return;
        if (submitted) {
            if (!correct && !reason) {
                finish();
                return;
            }
            finish();
            setTimeout(() => start(due[i - 1].id), 0);
        } else
            start(due[i - 1].id);
    }, next = () => {
        finish();
        if (nextQ)
            setTimeout(() => start(nextQ.id), 0);
    };
    const actions = <><div className="practice-actions three"><button onClick={previous} disabled={due.findIndex(q => q.id === current.id) <= 0}>← 上一题</button><button onClick={finish}>{correct ? '完成本题' : '保存复盘并完成'}</button><button className="next" onClick={next}>下一题 →</button></div><small className="duration">本题用时 {Math.floor(timer.seconds / 60)} 分 {timer.seconds % 60} 秒</small></>;
    return <div className="practice-wrap"><div className="practice-meta"><span>{current.section} · {current.type}</span><PracticeTimer value={timer}/></div><article className="practice-card"><p className="source">{current.source}</p><Markable id={`stem-${current.id}`} text={current.stem}/><QuestionVisuals refs={current.visualRefs}/><PracticeOptions q={current} value={selected} onChange={setSelected} submitted={submitted}/>{!submitted ? <><div className="certainty"><span>作答把握：</span>{['确定', '不确定', '蒙的'].map(x => <button className={certainty === x ? 'on' : ''} onClick={() => setCertainty(x)} key={x}>{x}</button>)}</div><button className="submit" onClick={submit}>提交答案并查看结果</button></> : correct ? <div className="correct-summary" role="status"><strong>✓ 回答正确</strong>{actions}</div> : <div className="result bad"><h3>回答错误 <span>正确答案 {current.answer || '待补充'}</span></h3><p><strong>解析：</strong>{current.explanation || '当前题目没有可用解析，请在题目编辑中补充答案与解析。'}</p><div className="review-box"><label>主要错因<select value={reason} onChange={e => setReason(e.target.value)}><option value="">请选择</option>{reasonsFor(current.section).map(x => <option key={x}>{x}</option>)}</select></label><label>一句话复盘<textarea value={reflection} onChange={e => setReflection(e.target.value)} placeholder="我在哪一步错了？下次如何改进？"/></label></div>{actions}</div>}</article></div>;
}
function MaterialPractice({ questions, start, due }: {
    questions: Question[];
    start: (id?: number) => void;
    due: Question[];
}) {
    const [answers, setAnswers] = useState<Record<number, string>>({}), [submitted, setSubmitted] = useState(false), [reason, setReason] = useState(''), [reflection, setReflection] = useState('');
    const timer = usePracticeTimer(questions.map(q => q.id).join(',')), material = cleanMaterialText(questions[0].material || questions[0].stem.split('\n\n')[0]), stem = (q: Question) => q.material ? q.stem : q.stem.split('\n\n').slice(1).join('\n\n') || q.stem, go = (i: number) => document.getElementById(`group-q-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const hasWrong = submitted && questions.some(q => answers[q.id] !== q.answer);
    const submit = () => {
        if (questions.some(q => !answers[q.id]))
            return alert('请先完成题组中的所有题目');
        setSubmitted(true);
    };
    const complete = (next: boolean) => {
        if (hasWrong && !reason)
            return alert('请先选择这组题的主要错因');
        window.dispatchEvent(new CustomEvent('complete-material-group', { detail: { items: questions.map(q => ({ id: q.id, selected: answers[q.id] })), reason, reflection } }));
        const q = due.find(x => !questions.some(g => g.id === x.id));
        if (next && q)
            setTimeout(() => start(q.id), 0);
    };
    const visualRefs = questions.flatMap(q => q.visualRefs || []).filter((reference, index, refs) => refs.findIndex(item => item.documentId === reference.documentId) === index);
    return <div className="material-practice"><aside><div className="material-head"><p className="eyebrow">共享材料 · {materialGroupLabel(questions[0])}</p><PracticeTimer value={timer}/></div><Markable id={`material-${questions[0].groupId || questions[0].id}`} text={material}/><QuestionVisuals refs={visualRefs}/></aside><section><div className="group-tabs">{questions.map((q, i) => <button className={answers[q.id] ? 'done' : ''} onClick={() => go(i)} key={q.id}>{q.questionNo || i + 1}题</button>)}</div>{questions.map((q, index) => { const wrong = submitted && answers[q.id] !== q.answer; return <article id={`group-q-${index}`} className="group-question" key={q.id}><h3>{q.questionNo || index + 1}. {stem(q)}</h3><PracticeOptions q={q} value={answers[q.id] || ''} onChange={v => setAnswers({ ...answers, [q.id]: v })} submitted={submitted}/>{wrong && <p className="group-explain"><strong>正确答案 {q.answer || '待补充'}</strong><br/>解析：{q.explanation || '当前题目没有可用解析，请在题目编辑中补充。'}</p>}</article>; })}{!submitted ? <button className="submit" onClick={submit}>提交整组答案并查看结果</button> : <>{!hasWrong && <div className="group-success" role="status">✓ 本组回答正确</div>}{hasWrong && <div className="review-box group-review"><label>主要错因<select value={reason} onChange={e => setReason(e.target.value)}><option value="">请选择</option>{reasonsFor(questions[0].section).map(x => <option key={x}>{x}</option>)}</select></label><label>整组复盘<textarea value={reflection} onChange={e => setReflection(e.target.value)} placeholder="这组题在信息定位、公式或计算上有什么问题？"/></label></div>}<div className="practice-actions three"><button onClick={() => go(Math.max(0, questions.length - 2))}>← 上一题</button><button onClick={() => complete(false)}>{hasWrong ? '保存复盘并完成' : '完成本组'}</button><button className="next" onClick={() => complete(true)}>下一题 →</button></div><small className="duration">本组用时 {Math.floor(timer.seconds / 60)} 分 {timer.seconds % 60} 秒</small></>}</section></div>;
}
function Analytics({ store }: {
    store: Store;
}) {
    const [active, setActive] = useState<string | null>(null);
    if (!active)
        return <><div className="analysis-intro"><div><p className="eyebrow">分板块诊断</p><h2>选择一个板块查看专属错因</h2><p>不同板块使用不同的错因体系，统计不再混在一起。</p></div><strong>{store.questions.length}<small>总错题</small></strong></div><div className="section-analysis-grid">{sections.map((section, index) => { const qs = store.questions.filter(q => q.section === section), attempts = qs.reduce((n, q) => n + q.attempts, 0), wrong = qs.reduce((n, q) => n + q.wrong, 0), mastered = qs.filter(q => q.status === '已掌握').length; return <button onClick={() => setActive(section)} className={`section-analysis-card tone-${index}`} key={section}><span>{String(index + 1).padStart(2, '0')}</span><h3>{section}</h3><div><b>{qs.length}<small>错题</small></b><b>{attempts ? Math.round(wrong / attempts * 100) : 0}%<small>错误负担</small></b><b>{qs.length ? Math.round(mastered / qs.length * 100) : 0}%<small>已掌握</small></b></div><em>进入分析 →</em></button>; })}</div></>;
    const qs = store.questions.filter(q => q.section === active), attempts = qs.reduce((n, q) => n + q.attempts, 0), wrong = qs.reduce((n, q) => n + q.wrong, 0), mastered = qs.filter(q => q.status === '已掌握').length, repeated = qs.filter(q => q.wrong >= 2).length;
    const configured = reasonsFor(active), reasonData = configured.map(r => ({ r, n: qs.filter(q => q.reason === r).length + store.attempts.filter(a => a.reason === r && qs.some(q => q.id === a.questionId)).length })).sort((a, b) => b.n - a.n), maxReason = Math.max(1, ...reasonData.map(x => x.n)), top = reasonData.find(x => x.n > 0);
    const types = [...new Set(qs.map(q => q.type))].map(type => ({ type, n: qs.filter(q => q.type === type).length, wrong: qs.filter(q => q.type === type).reduce((n, q) => n + q.wrong, 0) })).sort((a, b) => b.wrong - a.wrong).slice(0, 5);
    return <><button className="analysis-back" onClick={() => setActive(null)}>← 返回六大板块</button><div className="analysis-detail-head"><div><p className="eyebrow">板块诊断</p><h2>{active}</h2><p>{top ? `当前首要改进项是“${top.r}”，建议下一轮练习优先标记该错因。` : '继续完成题目复盘，系统将生成针对性改进建议。'}</p></div><span>{qs.length} 道错题</span></div><div className="analysis-kpis"><article><span>累计作答</span><strong>{attempts}</strong></article><article><span>错误负担</span><strong>{attempts ? Math.round(wrong / attempts * 100) : 0}%</strong></article><article><span>重复错误题</span><strong>{repeated}</strong></article><article><span>已掌握率</span><strong>{qs.length ? Math.round(mastered / qs.length * 100) : 0}%</strong></article></div><section className="analysis-detail-grid"><div className="panel"><p className="eyebrow">错因分布</p><h3>{active}专属错因</h3><div className="reason-bars">{reasonData.map(x => <div key={x.r}><span>{x.r}</span><i><b style={{ width: `${x.n ? Math.max(8, x.n / maxReason * 100) : 0}%` }}/></i><strong>{x.n}</strong></div>)}</div></div><div className="panel"><p className="eyebrow">题型薄弱点</p><h3>按累计错误排序</h3><div className="weak-types">{types.length ? types.map((x, i) => <div key={x.type}><b>{i + 1}</b><span>{x.type}<small>{x.n} 道收录</small></span><strong>{x.wrong} 次错误</strong></div>) : <div className="empty">暂无题型数据</div>}</div></div></section></>;
}
function Settings({ backup, restoreRef, restore, count }: {
    backup: () => void;
    restoreRef: React.RefObject<HTMLInputElement | null>;
    restore: (f: File) => void;
    count: number;
}) {
    const [keys, setKeys] = useState<{ deepseekKey: string }>(() => {
        if (typeof window === 'undefined')
            return { deepseekKey: '' };
        try {
            const saved = JSON.parse(localStorage.getItem('xct-api-settings') || '{}') as { deepseekKey?: string };
            return { deepseekKey: saved.deepseekKey || '' };
        }
        catch {
            return { deepseekKey: '' };
        }
    });
    const save = () => { localStorage.setItem('xct-api-settings', JSON.stringify(keys)); alert('接口配置已保存在这台 Mac'); };
    return <div className="settings"><section className="api-manager"><div className="api-title"><div><p className="eyebrow">接口管理</p><h2>DeepSeek 视觉识别</h2></div><span className="safe">✓ 本机保存</span></div><div className="api-provider"><div><b>deepseek-v4-flash-vision-exp</b><small>直接识别题目截图，提取可编辑材料文字、题干和选项，并定位原图中的表格、图表与题目图片。PDF 会先在本机转为 PNG，不会把完整 PDF 交给模型。</small></div><label>DeepSeek API Key<input type="password" value={keys.deepseekKey} placeholder="请输入 DeepSeek API Key" onChange={e => setKeys({ deepseekKey: e.target.value })}/></label></div><button className="solid save-api" onClick={save}>保存接口配置</button></section><section className="setting-card"><div><h3>数据与备份</h3><p>当前共有 {count} 道题，备份包含题目、作答与复盘。</p></div><div><button onClick={backup}>导出备份</button><button onClick={() => restoreRef.current?.click()}>从备份恢复</button><input ref={restoreRef} hidden type="file" accept="application/json" onChange={e => e.target.files?.[0] && restore(e.target.files[0])}/></div></section></div>;
}
function Editor({ q, setQ, close, save, importCandidate }: {
    q: Question;
    setQ: (q: Question) => void;
    close: () => void;
    save: () => void;
    importCandidate: boolean;
}) {
    return <div className="modal"><div className="editor"><div className="editor-head"><div><p className="eyebrow">{importCandidate ? '导入校对' : '题目编辑'}</p><h2>{q.source}</h2></div><button onClick={close}>×</button></div>{q.visualRefs?.length ? <div className="editor-visuals"><p>原题图表与表格</p><QuestionVisuals refs={q.visualRefs}/></div> : null}<div className="form-grid"><label className="wide">题干<textarea value={q.stem} onChange={e => setQ({ ...q, stem: e.target.value })}/></label>{q.options.map((o, i) => <label key={i}>选项 {'ABCD'[i]}<input value={o} onChange={e => { const a = [...q.options]; a[i] = e.target.value; setQ({ ...q, options: a }); }}/></label>)}<label>一级板块<select value={q.section} onChange={e => setQ({ ...q, section: e.target.value })}>{sections.map(x => <option key={x}>{x}</option>)}</select></label><label>题型<input value={q.type} onChange={e => setQ({ ...q, type: e.target.value })}/></label><label>正确答案<select value={q.answer} onChange={e => setQ({ ...q, answer: e.target.value })}><option value="">待确认</option>{['A', 'B', 'C', 'D'].map(x => <option key={x}>{x}</option>)}</select></label><label>答案来源<select value={q.answerSource} onChange={e => setQ({ ...q, answerSource: e.target.value })}>{['官方答案', '用户确认', 'AI 生成·已确认', 'AI 推测·未确认', '暂无答案'].map(x => <option key={x}>{x}</option>)}</select></label><label className="wide">解析<textarea value={q.explanation} onChange={e => setQ({ ...q, explanation: e.target.value })}/></label></div><div className="editor-actions"><span className="action-spacer"/><button onClick={close}>取消</button><button className="solid" onClick={save}>{importCandidate ? '保存校对' : '保存修改'}</button></div></div></div>;
}
