const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'Presentacion_APK.html');
const assetsDir = path.join(__dirname, 'assets');

try {
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    let injectedCount = 0;

    for (let i = 1; i <= 7; i++) {
        // Try multiple possible extensions
        const possibleExtensions = ['.png', '.jpg', '.jpeg'];
        let imgBuf = null;
        let mimeType = 'image/png';

        for (const ext of possibleExtensions) {
            const screenPath = path.join(assetsDir, `${i}${ext}`);
            if (fs.existsSync(screenPath)) {
                imgBuf = fs.readFileSync(screenPath);
                mimeType = `image/${ext === '.png' ? 'png' : 'jpeg'}`;
                break;
            }
        }

        if (imgBuf) {
            const base64Image = `data:${mimeType};base64,` + imgBuf.toString('base64');
            const placeholder = `SCREEN_${i}_PLACEHOLDER`;
            if (htmlContent.includes(placeholder)) {
                htmlContent = htmlContent.replace(placeholder, base64Image);
                console.log(`Successfully injected screen ${i} into HTML.`);
                injectedCount++;
            }
        } else {
            console.log(`Warning: Could not find screen image for ${i} in assets/ folder. Please save it as assets/${i}.png`);
        }
    }
    
    if (injectedCount > 0) {
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        console.log(`\nSuccess! Injected ${injectedCount} screens into the HTML.`);
    } else {
        console.log(`\nNo screens were injected. Make sure your images are named 1.png, 2.png... up to 7.png and are inside the 'assets' folder.`);
    }
} catch (err) {
    console.error("Error during injection:", err);
}
