import { NextResponse } from 'next/server';

type VisionInput = { documentId: string; name: string; page: number; dataUrl: string };
type Box = { x: number; y: number; width: number; height: number };
type Region = { documentId?: string; kind?: string; bbox?: Box; caption?: string };
type Material = { id?: string; text?: string; documentIds?: string[]; visualRegions?: Region[] };
type VisionQuestion = { questionNo?: string; materialGroupId?: string; sourceDocumentIds?: string[]; stem?: string; options?: string[]; answer?: string; explanation?: string; section?: string; type?: string; visualRegions?: Region[] };

const prompt = (images: VisionInput[]) => `你是“百官行述”的行测试卷视觉结构化引擎。你将看到 ${images.length} 张按顺序排列的题目截图或 PDF 页截图：
${images.map((image, index) => `${index + 1}. documentId=${image.documentId}，${image.name}，第 ${image.page} 页`).join('\n')}

目标是生成类似成熟题库的练习数据：材料正文必须是可选择、可划线的纯文本；表格、统计图、示意图和题目图形必须保留为原图裁切区域，不能用乱码或臆造的文本替代。

识别规则：
1. 完整识别材料、题干、A-D 选项及可见答案。修复截图换行，但不得改写原意、补造数字或猜测被遮挡内容。
2. materials 每个共享材料只出现一次。text 只写叙述性正文，保留自然段，用两个换行分段；不得放 Markdown 表格、HTML、JSON、坐标或图表数据转写。
3. 遇到表格、统计图、示意图、几何图、图形推理图或其他必须看图的内容，写入 visualRegions。bbox 使用相对原图的 0–1000 坐标，格式为 {x,y,width,height}，应紧贴完整视觉内容并保留标题、图例和单位，四周留约 8–15 个坐标单位安全边距。
4. 题干自身的图片区域写在 question.visualRegions；共享材料中的图表写在 material.visualRegions。不要把普通正文框成图片。
5. “根据所给材料，回答6～10题”等题号范围必须成为独立材料组。跨页材料合并为一个组，并列出所有 documentIds。不同题号范围绝不能合并。
6. sourceDocumentIds 只列题干和选项实际出现的图片；材料页列在 material.documentIds。question 通过 materialGroupId 引用材料，禁止重复长材料。
7. 你必须像行测老师一样完成每一道选择题：answer 必须填写你判断的 A/B/C/D，explanation 必须给出简洁、可核验的解题过程。资料分析题要写清数据定位、公式和关键计算；言语、判断、常识题要说明正确项依据及其他选项的关键错误。只有截图确实残缺到无法作答时才允许 answer 为空，并在 explanation 中明确说明缺失了什么。
8. 所有字符串必须是正常中文纯文本。无法确认的字段留空，不输出“乱码”“见图”等占位词。

只返回一个 JSON 对象，不要 Markdown 代码块，结构严格为：
{"materials":[{"id":"G1","text":"材料正文","documentIds":["document-id"],"visualRegions":[{"documentId":"document-id","kind":"table|chart|figure","bbox":{"x":0,"y":0,"width":1000,"height":500},"caption":"可选短说明"}]}],"questions":[{"questionNo":"1","materialGroupId":"G1或空字符串","sourceDocumentIds":["document-id"],"stem":"题干","options":["选项内容","选项内容","选项内容","选项内容"],"answer":"A|B|C|D","explanation":"完整但简洁的解题依据","section":"常识判断|政治理论|言语理解与表达|判断推理|数量关系|资料分析","type":"题型","visualRegions":[]}]}`;

function parseJson(content: string) {
  const cleaned = content.replace(/^```json\s*|\s*```$/g, '').trim();
  try { return JSON.parse(cleaned) as { materials?: Material[]; questions?: VisionQuestion[] }; }
  catch {
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('DeepSeek 返回内容不是有效 JSON');
    return JSON.parse(cleaned.slice(start, end + 1)) as { materials?: Material[]; questions?: VisionQuestion[] };
  }
}

function validRegion(region: Region, knownIds: Set<string>): region is Region & { documentId: string; bbox: Box } {
  const box = region.bbox;
  return Boolean(region.documentId && knownIds.has(region.documentId) && box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 5 && box.height > 5);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { images?: VisionInput[]; apiKey?: string };
    const images = body.images || [];
    const key = body.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!key) return NextResponse.json({ error: '请先在设置中填写 DeepSeek API Key' }, { status: 400 });
    if (!images.length) return NextResponse.json({ error: '没有可供识别的题目图片' }, { status: 400 });
    if (images.some(image => !/^data:image\/(?:jpeg|png|gif|webp);base64,/i.test(image.dataUrl)))
      return NextResponse.json({ error: 'DeepSeek 视觉仅支持 JPEG、PNG、GIF、WebP 图片' }, { status: 400 });
    const approximateBytes = images.reduce((sum, image) => sum + image.dataUrl.length * 0.75, 0);
    if (approximateBytes > 44 * 1024 * 1024)
      return NextResponse.json({ error: '本次图片总量超过 DeepSeek 内联请求限制，请分批导入（建议每次不超过 40 MB）' }, { status: 413 });

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-v4-flash-vision-exp', temperature: 0, max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt(images) },
          ...images.map(image => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'original' } })),
        ] }],
      }),
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: `DeepSeek HTTP ${response.status}：${data.error?.message || '视觉识别失败'}` }, { status: 502 });
    const choice = data.choices?.[0];
    const parsed = parseJson(choice?.message?.content || '');
    const knownIds = new Set(images.map(image => image.documentId));
    const materials = (parsed.materials || []).map((material, index) => ({
      id: String(material.id || `G${index + 1}`), text: String(material.text || '').trim(),
      documentIds: (material.documentIds || []).map(String).filter(id => knownIds.has(id)),
      visualRegions: (material.visualRegions || []).filter(region => validRegion(region, knownIds)),
    }));
    const materialMap = new Map(materials.map(material => [material.id, material]));
    const questions = (parsed.questions || []).map((question, index) => {
      const material = materialMap.get(String(question.materialGroupId || ''));
      const answer = /^[A-D]$/i.test(String(question.answer || '').trim()) ? String(question.answer).trim().toUpperCase() : '';
      return { ...question, questionNo: String(question.questionNo || index + 1), materialGroupId: material?.id || '', material: material?.text || '', materialDocumentIds: material?.documentIds || [], sourceDocumentIds: (question.sourceDocumentIds || []).map(String).filter(id => knownIds.has(id)), options: (question.options || []).map(String).slice(0, 4), answer, explanation: String(question.explanation || '').trim(), visualRegions: [...(material?.visualRegions || []), ...(question.visualRegions || []).filter(region => validRegion(region, knownIds))] };
    }).filter(question => String(question.stem || '').trim());
    if (!questions.length) return NextResponse.json({ error: 'DeepSeek 没有识别到完整题目，请检查截图是否清晰且包含题干和选项' }, { status: 422 });
    return NextResponse.json({ questions, materials, analysisMode: 'deepseek-v4-flash-vision-exp', finishReason: choice?.finish_reason });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DeepSeek 视觉识别请求失败' }, { status: 500 });
  }
}
