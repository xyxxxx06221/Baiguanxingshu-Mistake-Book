'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type FractionItem = { percent: string; denominator: number; exact: boolean };
type ItemStats = { attempts: number; correct: number; wrong: number; lastPracticedAt: string };
type Round = {
  queue: string[];
  position: number;
  total: number;
  correct: number;
  wrong: number;
  streak: number;
  firstTryCorrect: number;
  attempted: string[];
  completed: string[];
  mode: 'all' | 'wrong';
  input: string;
  pendingResult: 'correct' | 'wrong' | null;
};
type Persisted = { stats: Record<string, ItemStats>; round: Round | null };

export const FRACTION_ITEMS: FractionItem[] = [
  ['2',50,1],['2.5',40,1],['3.3',30,0],['5',20,1],['5.3',19,0],['5.6',18,0],['5.9',17,0],['6.25',16,1],['6.7',15,0],['7.1',14,0],['7.7',13,0],['8.3',12,0],['9.1',11,0],['9.5',10.5,0],['10',10,1],['10.5',9.5,0],['11.1',9,0],['12.5',8,1],['13',7.7,0],['14.3',7,0],['15',6.7,0],['16.7',6,0],['17',5.9,0],['18',5.6,0],['19',5.3,0],['20',5,1],['25',4,1],['33.3',3,0],['50',2,1],
  ['2.2',45,0],['3',33,0],['4',25,1],['6',16.5,0],['6.5',15.5,0],['6.9',14.5,0],['7.4',13.5,0],['8',12.5,1],['11.8',8.5,0],['13.3',7.5,0],['15.4',6.5,0],['18.2',5.5,0],['22.2',4.5,0],['28.6',3.5,0],
].map(([percent, denominator, exact]) => ({ percent: String(percent), denominator: Number(denominator), exact: Boolean(exact) }));

const STORAGE_KEY = 'baiguan-percent-fraction-v1';
const emptyData = (): Persisted => ({ stats: {}, round: null });
const shuffle = (values: string[]) => {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; }
  return next;
};
const makeRound = (ids: string[], mode: Round['mode']): Round => ({ queue: shuffle(ids), position: 0, total: ids.length, correct: 0, wrong: 0, streak: 0, firstTryCorrect: 0, attempted: [], completed: [], mode, input: '', pendingResult: null });
const validRound = (value: unknown): value is Round => {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<Round>;
  return Array.isArray(r.queue) && r.queue.every(id => FRACTION_ITEMS.some(item => item.percent === id)) && Number.isInteger(r.position) && Number(r.position) >= 0 && Number(r.position) <= r.queue.length && Number.isInteger(r.total) && Number(r.total) > 0 && Array.isArray(r.attempted) && Array.isArray(r.completed);
};
const loadData = (): Persisted => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Persisted | null;
    if (!parsed || typeof parsed.stats !== 'object' || parsed.stats === null || (parsed.round !== null && !validRound(parsed.round))) return emptyData();
    return { ...parsed, round: parsed.round ? { ...parsed.round, input: typeof parsed.round.input === 'string' ? parsed.round.input : '', pendingResult: parsed.round.pendingResult === 'correct' || parsed.round.pendingResult === 'wrong' ? parsed.round.pendingResult : null } : null };
  } catch { return emptyData(); }
};

export default function PercentFractionPractice() {
  const [data, setData] = useState<Persisted>(emptyData);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Local persistence is intentionally hydrated after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(loadData());
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data, hydrated]);
  const round = data.round;
  const input = round?.input || '';
  const result = round?.pendingResult || null;
  const finished = Boolean(round && round.position >= round.queue.length);
  const current = round && !finished ? FRACTION_ITEMS.find(item => item.percent === round.queue[round.position]) : null;
  const wrongIds = useMemo(() => FRACTION_ITEMS.filter(item => (data.stats[item.percent]?.wrong || 0) > 0).map(item => item.percent), [data.stats]);

  const startRound = (mode: Round['mode'] = 'all') => {
    const ids = mode === 'wrong' ? wrongIds : FRACTION_ITEMS.map(item => item.percent);
    if (!ids.length) { setMessage('暂无错题记录'); return; }
    setData(previous => ({ ...previous, round: makeRound(ids, mode) }));
    setMessage('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const normalize = (value: string) => value.trim().replace(/[。．]/g, '.');
  const onChange = (value: string) => {
    const normalized = value.replace(/[。．]/g, '.');
    if (/^\d*\.?\d*$/.test(normalized)) {
      setData(previous => previous.round ? ({ ...previous, round: { ...previous.round, input: normalized } }) : previous);
      setMessage('');
    }
  };
  const submit = () => {
    if (!current || result) return;
    const normalized = normalize(input);
    if (!normalized) { setMessage('请输入分母'); return; }
    if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized))) { setMessage('请输入有效数字'); return; }
    const correct = Number(normalized) === current.denominator;
    const now = new Date().toISOString();
    setData(previous => {
      if (!previous.round) return previous;
      const r = previous.round;
      const firstAttempt = !r.attempted.includes(current.percent);
      const queue = [...r.queue];
      if (!correct) queue.splice(Math.min(r.position + 4, queue.length), 0, current.percent);
      const old = previous.stats[current.percent] || { attempts: 0, correct: 0, wrong: 0, lastPracticedAt: '' };
      return {
        stats: { ...previous.stats, [current.percent]: { attempts: old.attempts + 1, correct: old.correct + (correct ? 1 : 0), wrong: old.wrong + (correct ? 0 : 1), lastPracticedAt: now } },
        round: { ...r, queue, pendingResult: correct ? 'correct' : 'wrong', correct: r.correct + (correct ? 1 : 0), wrong: r.wrong + (correct ? 0 : 1), streak: correct ? r.streak + 1 : 0, firstTryCorrect: r.firstTryCorrect + (correct && firstAttempt ? 1 : 0), attempted: firstAttempt ? [...r.attempted, current.percent] : r.attempted, completed: correct && !r.completed.includes(current.percent) ? [...r.completed, current.percent] : r.completed },
      };
    });
    setMessage(correct ? '回答正确' : `${current.percent}% ${current.exact ? '=' : '≈'} 1/${current.denominator}`);
  };
  const next = () => {
    if (!round || !result) return;
    setData(previous => previous.round ? ({ ...previous, round: { ...previous.round, position: previous.round.position + 1, input: '', pendingResult: null } }) : previous);
    setMessage('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  useEffect(() => {
    if (!result) return;
    const advanceOnEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat) return;
      event.preventDefault();
      next();
    };
    window.addEventListener('keydown', advanceOnEnter);
    return () => window.removeEventListener('keydown', advanceOnEnter);
  });
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (result) next(); else submit();
  };

  if (!hydrated) return <div className="percent-loading">正在载入练习…</div>;
  return <div className="percent-page">
    <section className="percent-toolbar" aria-label="本轮练习状态">
      <div><span>已完成</span><strong>{round?.completed.length || 0} / {round?.total || FRACTION_ITEMS.length}</strong></div>
      <div><span>正确</span><strong>{round?.correct || 0}</strong></div><div><span>错误</span><strong>{round?.wrong || 0}</strong></div><div><span>连续答对</span><strong>{round?.streak || 0}</strong></div>
      <div className="percent-actions"><button onClick={() => startRound(round?.mode || 'all')}>重新开始</button><button disabled={!wrongIds.length} title={!wrongIds.length ? '暂无错题记录' : undefined} onClick={() => startRound('wrong')}>只练错题</button><button onClick={() => setTableOpen(value => !value)}>{tableOpen ? '收起换算表' : '查看换算表'}</button></div>
    </section>

    {(!round || finished) ? <section className="percent-summary">
      {!round ? <><div className="percent-symbol">%</div><h2>熟记常用百分数与分数换算</h2><p>共 43 项，每题只填写分母。错题会间隔三题后再次出现。</p><button className="percent-primary" onClick={() => startRound('all')}>开始练习</button></> : <><p className="eyebrow">本轮完成</p><h2>{round.mode === 'wrong' ? '错题巩固完成' : '43 项换算练习完成'}</h2><div className="percent-result-grid"><div><span>正确率</span><strong>{round.correct + round.wrong ? Math.round(round.correct / (round.correct + round.wrong) * 100) : 0}%</strong></div><div><span>首次答对</span><strong>{round.firstTryCorrect}</strong></div><div><span>继续记忆</span><strong>{round.total - round.firstTryCorrect}</strong></div></div><button className="percent-primary" onClick={() => startRound(round.mode)}>再来一轮</button></>}
    </section> : current && <section className={`percent-card ${result || ''}`}>
      <div className="percent-question"><strong>{current.percent}%</strong><span>{current.exact ? '=' : '≈'} ？</span></div>
      <label className="fraction-answer"><span className="fraction-one">1</span><span className="fraction-line"/><input ref={inputRef} autoFocus inputMode="decimal" aria-label="分母" value={input} disabled={Boolean(result)} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder="分母" /></label>
      <div className={`percent-feedback ${result || (message ? 'notice' : '')}`} aria-live="polite">{message || (result === 'correct' ? '回答正确' : result === 'wrong' ? `${current.percent}% ${current.exact ? '=' : '≈'} 1/${current.denominator}` : '输入分母后按 Enter 提交')}</div>
      {!result ? <button className="percent-primary" onClick={submit}>提交答案</button> : <button className="percent-primary" onClick={next}>{result === 'correct' ? '下一题' : '记住了，下一题'}</button>}
    </section>}

    {tableOpen && <section className="fraction-table"><div className="fraction-table-head"><div><p className="eyebrow">本期题库</p><h2>全部换算关系</h2></div><span>43 项</span></div><div className="fraction-table-grid">{FRACTION_ITEMS.map(item => <div key={item.percent}><strong>{item.percent}%</strong><span>{item.exact ? '=' : '≈'}</span><b>1/{item.denominator}</b></div>)}</div></section>}
  </div>;
}
