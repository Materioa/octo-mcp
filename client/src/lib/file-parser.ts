import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export async function parseFileContent(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  try {
    if (extension === 'pdf') {
      return await parsePDF(file);
    } else if (['docx', 'doc'].includes(extension || '')) {
      return await parseWord(file);
    } else if (['xlsx', 'xls', 'csv'].includes(extension || '')) {
      return await parseExcel(file);
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp3', 'mp4', 'webm', 'ogg', 'wav', 'mpeg', 'avi', 'mov'].includes(extension || '')) {
      return ''; // No text extraction for media files
    } else {
      // Fallback for plain text, json, md, etc.
      return await file.text();
    }
  } catch (err: any) {
    throw new Error(`Failed to parse ${file.name}: ${err.message}`);
  }
}

async function parsePDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    text += strings.join(' ') + '\n';
  }
  return text;
}

export async function generatePdfPreview(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 1.0 });
  
  // Scale down to max 300px width/height for thumbnail
  const scale = Math.min(300 / viewport.width, 300 / viewport.height);
  const scaledViewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) throw new Error("Could not create canvas context");
  
  canvas.height = scaledViewport.height;
  canvas.width = scaledViewport.width;
  
  await page.render({
    canvasContext: context,
    viewport: scaledViewport
  }).promise;
  
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function parseWord(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function parseExcel(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  let text = '';
  
  for (const sheetName of workbook.SheetNames) {
    text += `\n--- Sheet: ${sheetName} ---\n`;
    const worksheet = workbook.Sheets[sheetName];
    if (worksheet) {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      text += csv + '\n';
    }
  }
  
  return text;
}
