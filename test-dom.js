import { JSDOM } from 'jsdom';
import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

console.log("step-1:", !!document.getElementById('step-1'));
console.log("step-2:", !!document.getElementById('step-2'));
console.log("step-3:", !!document.getElementById('step-3'));
console.log("preview-box:", !!document.getElementById('preview-box'));
console.log("original-img:", !!document.getElementById('original-img'));
console.log("filtered-img:", !!document.getElementById('filtered-img'));
console.log("slider:", !!document.getElementById('slider'));
