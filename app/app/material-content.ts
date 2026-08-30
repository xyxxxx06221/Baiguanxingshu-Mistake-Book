const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanMaterialText(value: unknown) {
    const cleaned = String(value || '')
        .replace(CONTROL_CHARACTERS, '')
        .replace(/```(?:json|markdown|md)?\s*/gi, '')
        .replace(/```/g, '')
        .replace(/<table\b[\s\S]*?<\/table>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\u3010(?:图表解析|表格)\u3011[\s\S]*?(?=\n\s*\n|$)/g, '')
        .split('\n')
        .filter(line => (line.match(/\|/g) || []).length < 2)
        .join('\n')
        .replace(/(?:请)?(?:回答|作答)\s*\d{1,3}\s*(?:[~～—–－-]|至)\s*\d{1,3}\s*题/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    const questionStart = /(?:^|[\n。！？])\s*\d{1,3}[.．、]\s*/m.exec(cleaned);
    const leading = questionStart?.[0]?.[0] || '';
    const keepLeadingPunctuation = leading === '\n' || /[。！？]/.test(leading);
    return (questionStart ? cleaned.slice(0, questionStart.index + (keepLeadingPunctuation ? 1 : 0)) : cleaned).trim();
}
