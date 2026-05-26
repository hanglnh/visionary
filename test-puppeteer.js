import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Start server locally, assume it is running on 5173
  await page.goto('http://localhost:5173/visionary/', { waitUntil: 'networkidle0' });
  
  // Click the first sample image
  console.log("Clicking sample image...");
  await page.click('#sample-images button');
  
  // Wait for 3 seconds for it to process
  await new Promise(r => setTimeout(r, 3000));
  
  // Take screenshot
  await page.screenshot({ path: 'puppeteer_test.png', fullPage: true });
  console.log("Screenshot saved to puppeteer_test.png");
  
  // Evaluate the state
  const dataUrl = await page.evaluate(() => window.currentImageDataUrl);
  console.log("Data URL length:", dataUrl ? dataUrl.length : 'null');
  
  const originalSrc = await page.evaluate(() => document.getElementById('original-img').src);
  console.log("original-img src length:", originalSrc ? originalSrc.length : 'null');
  
  // Is step-2 visible?
  const step2Class = await page.evaluate(() => document.getElementById('step-2').className);
  console.log("step-2 classes:", step2Class);
  
  // Check if original-img has size
  const imgBounds = await page.evaluate(() => {
    const rect = document.getElementById('original-img').getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  console.log("original-img bounds:", imgBounds);

  await browser.close();
})();
