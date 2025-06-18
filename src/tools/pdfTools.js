import fs from "fs-extra";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/**
 * Extract text content from a PDF.
 * @param {Object} params
 * @param {string} params.filePath - Path to the source PDF.
 */
export async function readPdf({ filePath }) {
  try {
    if (!filePath) throw new Error("filePath is required");
    const resolvedPath = path.resolve(filePath);
    if (!(await fs.pathExists(resolvedPath))) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
        path: resolvedPath,
      };
    }
    const dataBuffer = await fs.readFile(resolvedPath);
    const data = await pdfParse(dataBuffer);
    return {
      success: true,
      path: resolvedPath,
      text: data.text,
      info: data.info,
      pageCount: data.numpages,
    };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

/**
 * Create a simple one-page PDF from provided text content.
 * @param {Object} params
 * @param {string} params.content - Text to embed in PDF.
 * @param {string} params.outputPath - Where to save the generated PDF.
 */
export async function createPdf({ content = "", outputPath }) {
  try {
    if (!outputPath) throw new Error("outputPath is required");
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();
    const fontSize = 12;
    page.drawText(content, {
      x: 50,
      y: height - 50 - fontSize,
      size: fontSize,
      font,
      maxWidth: width - 100,
    });

    const pdfBytes = await pdfDoc.save();
    const resolvedPath = path.resolve(outputPath);
    await fs.ensureDir(path.dirname(resolvedPath));
    await fs.writeFile(resolvedPath, pdfBytes);
    return { success: true, path: resolvedPath, size: pdfBytes.length };
  } catch (error) {
    return { success: false, error: error.message, path: outputPath };
  }
}

/**
 * Merge multiple PDFs into a single document.
 * @param {Object} params
 * @param {string[]} params.files - Paths to source PDFs.
 * @param {string} params.outputPath - Path to merged output PDF.
 */
export async function mergePdfs({ files = [], outputPath }) {
  try {
    if (!Array.isArray(files) || files.length < 2)
      throw new Error("Provide at least two PDF files to merge");
    if (!outputPath) throw new Error("outputPath is required");

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const resolved = path.resolve(file);
      if (!(await fs.pathExists(resolved)))
        throw new Error(`File not found: ${file}`);
      const bytes = await fs.readFile(resolved);
      const srcDoc = await PDFDocument.load(bytes);
      const copiedPages = await mergedPdf.copyPages(
        srcDoc,
        srcDoc.getPageIndices()
      );
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const resolvedOut = path.resolve(outputPath);
    await fs.ensureDir(path.dirname(resolvedOut));
    await fs.writeFile(resolvedOut, mergedBytes);

    return {
      success: true,
      path: resolvedOut,
      size: mergedBytes.length,
      filesMerged: files.length,
    };
  } catch (error) {
    return { success: false, error: error.message, files };
  }
}

/**
 * Split a PDF into individual pages or provided ranges.
 * @param {Object} params
 * @param {string} params.filePath - Source PDF.
 * @param {Array<[number,number]>} [params.ranges] - Optional page ranges (1-indexed).
 * @param {string} params.outputDir - Directory to place split PDFs.
 */
export async function splitPdf({
  filePath,
  ranges = null,
  outputDir = "splits",
}) {
  try {
    if (!filePath) throw new Error("filePath is required");
    const resolved = path.resolve(filePath);
    if (!(await fs.pathExists(resolved)))
      throw new Error(`File not found: ${filePath}`);

    const pdfBytes = await fs.readFile(resolved);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const totalPages = pdfDoc.getPageCount();

    // Helper to save a new PDF consisting of given indices
    const saveRange = async (indices, name) => {
      const newDoc = await PDFDocument.create();
      const pages = await newDoc.copyPages(pdfDoc, indices);
      pages.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      const fileName = path.join(outputDir, name);
      await fs.ensureDir(path.dirname(fileName));
      await fs.writeFile(fileName, bytes);
      return { path: fileName, size: bytes.length };
    };

    let outputs = [];
    if (Array.isArray(ranges) && ranges.length) {
      let idx = 0;
      for (const [start, end] of ranges) {
        const s = Math.max(1, start);
        const e = Math.min(totalPages, end ?? start);
        const indices = Array.from({ length: e - s + 1 }, (_, i) => s - 1 + i);
        const res = await saveRange(indices, `split_${++idx}.pdf`);
        outputs.push(res);
      }
    } else {
      // split each page
      for (let i = 0; i < totalPages; i++) {
        const res = await saveRange([i], `page_${i + 1}.pdf`);
        outputs.push(res);
      }
    }

    return {
      success: true,
      outputDir: path.resolve(outputDir),
      files: outputs,
    };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}

/**
 * Add semi-transparent watermark text to every page of a PDF.
 * @param {Object} params
 * @param {string} params.filePath - Source PDF.
 * @param {string} params.watermarkText - Text to apply.
 * @param {string} params.outputPath - Destination PDF.
 */
export async function addPdfWatermark({
  filePath,
  watermarkText = "",
  outputPath,
}) {
  try {
    if (!filePath || !outputPath)
      throw new Error("filePath and outputPath are required");
    const resolved = path.resolve(filePath);
    if (!(await fs.pathExists(resolved)))
      throw new Error(`File not found: ${filePath}`);

    const pdfBytes = await fs.readFile(resolved);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    pdfDoc.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      page.drawText(watermarkText, {
        x: width / 2 - 50,
        y: height / 2,
        size: 50,
        font,
        color: rgb(0.75, 0.75, 0.75),
        rotate: { degrees: 45 },
        opacity: 0.3,
      });
    });

    const outBytes = await pdfDoc.save();
    const resolvedOut = path.resolve(outputPath);
    await fs.ensureDir(path.dirname(resolvedOut));
    await fs.writeFile(resolvedOut, outBytes);

    return { success: true, path: resolvedOut, size: outBytes.length };
  } catch (error) {
    return { success: false, error: error.message, path: filePath };
  }
}
