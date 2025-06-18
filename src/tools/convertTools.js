import fs from "fs-extra";
import path from "path";
import Papa from "papaparse";
import { parseStringPromise, Builder } from "xml2js";
import { marked } from "marked";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Helper to ensure directories exist
async function ensureDirFor(filePath) {
  await fs.ensureDir(path.dirname(filePath));
}

/**
 * Convert CSV file to JSON
 * @param {Object} params
 * @param {string} params.csvPath
 * @param {string} params.jsonPath
 */
export async function csvToJson({ csvPath, jsonPath }) {
  try {
    if (!csvPath || !jsonPath)
      throw new Error("csvPath and jsonPath are required");
    const csvResolved = path.resolve(csvPath);
    if (!(await fs.pathExists(csvResolved)))
      throw new Error(`File not found: ${csvPath}`);
    const csvData = await fs.readFile(csvResolved, "utf8");
    const { data } = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
    });
    const jsonResolved = path.resolve(jsonPath);
    await ensureDirFor(jsonResolved);
    await fs.writeJSON(jsonResolved, data, { spaces: 2 });
    return { success: true, path: jsonResolved, rows: data.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Convert JSON file to CSV
 * @param {Object} params
 * @param {string} params.jsonPath
 * @param {string} params.csvPath
 */
export async function jsonToCsv({ jsonPath, csvPath }) {
  try {
    if (!jsonPath || !csvPath)
      throw new Error("jsonPath and csvPath are required");
    const jsonResolved = path.resolve(jsonPath);
    if (!(await fs.pathExists(jsonResolved)))
      throw new Error(`File not found: ${jsonPath}`);
    const jsonData = await fs.readJSON(jsonResolved);
    const csv = Papa.unparse(jsonData);
    const csvResolved = path.resolve(csvPath);
    await ensureDirFor(csvResolved);
    await fs.writeFile(csvResolved, csv, "utf8");
    return {
      success: true,
      path: csvResolved,
      rows: Array.isArray(jsonData) ? jsonData.length : undefined,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Convert XML to JSON
 * @param {Object} params
 * @param {string} params.xmlPath
 * @param {string} params.jsonPath
 */
export async function xmlToJson({ xmlPath, jsonPath }) {
  try {
    if (!xmlPath || !jsonPath)
      throw new Error("xmlPath and jsonPath are required");
    const xmlResolved = path.resolve(xmlPath);
    if (!(await fs.pathExists(xmlResolved)))
      throw new Error(`File not found: ${xmlPath}`);
    const xmlData = await fs.readFile(xmlResolved, "utf8");
    const jsonObj = await parseStringPromise(xmlData, { explicitArray: false });
    const jsonResolved = path.resolve(jsonPath);
    await ensureDirFor(jsonResolved);
    await fs.writeJSON(jsonResolved, jsonObj, { spaces: 2 });
    return { success: true, path: jsonResolved };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Convert JSON to XML
 * @param {Object} params
 * @param {string} params.jsonPath
 * @param {string} params.xmlPath
 */
export async function jsonToXml({ jsonPath, xmlPath }) {
  try {
    if (!jsonPath || !xmlPath)
      throw new Error("jsonPath and xmlPath are required");
    const jsonResolved = path.resolve(jsonPath);
    if (!(await fs.pathExists(jsonResolved)))
      throw new Error(`File not found: ${jsonPath}`);
    const jsonData = await fs.readJSON(jsonResolved);
    const builder = new Builder();
    const xmlContent = builder.buildObject(jsonData);
    const xmlResolved = path.resolve(xmlPath);
    await ensureDirFor(xmlResolved);
    await fs.writeFile(xmlResolved, xmlContent, "utf8");
    return { success: true, path: xmlResolved };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Convert Markdown to PDF using marked + pdf-lib
 * @param {Object} params
 * @param {string} params.mdPath
 * @param {string} params.pdfPath
 */
export async function markdownToPdf({ mdPath, pdfPath }) {
  try {
    if (!mdPath || !pdfPath) throw new Error("mdPath and pdfPath are required");
    const mdResolved = path.resolve(mdPath);
    if (!(await fs.pathExists(mdResolved)))
      throw new Error(`File not found: ${mdPath}`);

    const mdContent = await fs.readFile(mdResolved, "utf8");
    const htmlContent = marked(mdContent);

    // For simplicity, we strip HTML tags and embed as plain text.
    const textContent = htmlContent.replace(/<[^>]*>/g, "");

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();
    const fontSize = 12;
    page.drawText(textContent, {
      x: 50,
      y: height - 50 - fontSize,
      size: fontSize,
      font,
      maxWidth: width - 100,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfResolved = path.resolve(pdfPath);
    await ensureDirFor(pdfResolved);
    await fs.writeFile(pdfResolved, pdfBytes);

    return { success: true, path: pdfResolved, size: pdfBytes.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
