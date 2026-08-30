'use client';
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';

export type VisualRef = {
    assetId: string;
    documentId: string;
    name: string;
    mimeType: string;
    page: number;
    kind?: 'source-image' | 'page-image' | 'chart-image';
    fallbackAssetId?: string;
};

type StoredVisualAsset = {
    id: string;
    name: string;
    mimeType: string;
    blob: Blob;
};

const DB_NAME = 'baiguan-visual-assets-v1';
const STORE_NAME = 'assets';

function openDatabase() {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME))
                request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('无法打开图表素材库'));
    });
}

export async function saveVisualAsset(asset: StoredVisualAsset) {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(asset);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('图表素材保存失败'));
    });
    database.close();
}

export async function loadVisualAsset(id: string) {
    const database = await openDatabase();
    const asset = await new Promise<StoredVisualAsset | undefined>((resolve, reject) => {
        const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result as StoredVisualAsset | undefined);
        request.onerror = () => reject(request.error || new Error('图表素材读取失败'));
    });
    database.close();
    return asset;
}

export async function visualAssetToDataUrl(id: string) {
    const asset = await loadVisualAsset(id);
    if (!asset) throw new Error(`本地图片素材不存在：${id}`);
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('图片编码失败'));
        reader.readAsDataURL(asset.blob);
    });
}

export async function cropVisualAsset(sourceId: string, outputId: string, box: { x: number; y: number; width: number; height: number }, name: string) {
    const source = await loadVisualAsset(sourceId);
    if (!source) throw new Error('找不到图表对应的原始截图');
    const bitmap = await createImageBitmap(source.blob);
    // Vision bounding boxes can land a few pixels inside chart axes or table
    // borders. Expand every edge before cropping so labels and units survive.
    const padding = Math.max(32, Math.min(72, Math.min(box.width, box.height) * 0.08));
    const x = Math.max(0, Math.min(1000, box.x - padding));
    const y = Math.max(0, Math.min(1000, box.y - padding));
    const right = Math.max(x + 1, Math.min(1000, box.x + box.width + padding));
    const bottom = Math.max(y + 1, Math.min(1000, box.y + box.height + padding));
    const width = right - x;
    const height = bottom - y;
    const sx = Math.floor(bitmap.width * x / 1000), sy = Math.floor(bitmap.height * y / 1000);
    const sw = Math.max(1, Math.ceil(bitmap.width * width / 1000)), sh = Math.max(1, Math.ceil(bitmap.height * height / 1000));
    const canvas = document.createElement('canvas');
    canvas.width = sw; canvas.height = sh;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('无法创建图表裁切画布');
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图表裁切失败')), 'image/png'));
    await saveVisualAsset({ id: outputId, name, mimeType: 'image/png', blob });
    return outputId;
}

let pdfWorker: Worker | null = null;

export async function renderPdfPages(file: File, sourceAssetId: string, pages: number[]) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfWorker ||= new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const rendered = new Map<number, string>();
    for (const pageNumber of [...new Set(pages)].filter(page => page > 0 && page <= pdf.numPages)) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 1900 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });
        if (!context)
            throw new Error(`PDF 第 ${pageNumber} 页截图失败`);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(`PDF 第 ${pageNumber} 页无法转换为图片`)), 'image/png'));
        const id = `${sourceAssetId}-rendered-page-${pageNumber}`;
        await saveVisualAsset({ id, name: `${file.name} · 第 ${pageNumber} 页`, mimeType: 'image/png', blob });
        rendered.set(pageNumber, id);
    }
    return rendered;
}
