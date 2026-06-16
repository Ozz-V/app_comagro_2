const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'Presentacion_APK.html');
const iconPath = path.join(__dirname, 'assets', 'icon.png');

try {
    // Read the image and convert to base64
    const imageBuf = fs.readFileSync(iconPath);
    const base64Image = 'data:image/png;base64,' + imageBuf.toString('base64');
    
    // Read HTML
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Replace placeholder
    htmlContent = htmlContent.replace('BASE64_PLACEHOLDER', base64Image);
    
    // Write back
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log("Successfully injected base64 logo into HTML.");
} catch (err) {
    console.error("Error during injection:", err);
}
