/**
 * Core logic for decomposing HTML files.
 */
export class RefactorEngine {
    constructor() {
        this.parser = new DOMParser();
        this.logs = [];
    }

    log(message, type = 'info') {
        this.logs.push({ message, type });
    }

    /**
     * Main entry point to process HTML string.
     * @param {string} htmlString - The raw HTML content.
     * @param {object} options - Configuration options (cssStrategy, jsStrategy, extremeMode).
     * @returns {object} - { html, files, logs }
     */
    process(htmlString, options) {
        this.logs = []; // Reset logs
        this.log("Starting extraction process...", "info");

        // Parse HTML
        let doc;
        try {
            doc = this.parser.parseFromString(htmlString, "text/html");
            if (doc.querySelector("parsererror")) {
                throw new Error("Invalid HTML detected");
            }
        } catch (e) {
            this.log(`Parsing Error: ${e.message}`, "error");
            return { html: null, files: [], logs: this.logs };
        }

        const files = [];

        // 1. Process CSS
        this.log(`Processing CSS with strategy: ${options.cssStrategy}`, "info");
        const styleFiles = this.extractStyles(doc, options.cssStrategy);
        files.push(...styleFiles);

        // 2. Process JS
        this.log(`Processing JavaScript with strategy: ${options.jsStrategy}`, "info");
        const scriptFiles = this.extractScripts(doc, options.jsStrategy);
        files.push(...scriptFiles);

        // 3. Process Extreme Mode (Dynamic Body)
        if (options.extremeMode) {
            this.log("Extreme Mode enabled: converting body to JS", "info");
            const dynamicFiles = this.applyExtremeMode(doc);
            files.push(...dynamicFiles);
        }

        // Serialize final HTML
        const serializer = new XMLSerializer();
        const finalHtml = serializer.serializeToString(doc);

        this.log("Refactoring complete.", "success");

        return {
            html: finalHtml,
            files: files,
            logs: this.logs
        };
    }

    /**
     * Extracts <style> tags.
     */
    extractStyles(doc, strategy) {
        const styles = Array.from(doc.querySelectorAll('style'));
        const generatedFiles = [];

        if (styles.length === 0) {
            this.log("No inline <style> tags found.", "info");
            return generatedFiles;
        }

        this.log(`Found ${styles.length} style blocks.`, "info");

        if (strategy === 'merge') {
            let combinedCSS = "";

            // Collect content
            styles.forEach((style, index) => {
                combinedCSS += `/* Extracted Block ${index + 1} */\n`;
                combinedCSS += style.textContent + "\n\n";
                style.remove();
            });

            // Add single link tag
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/styles.css';
            doc.head.appendChild(link);

            generatedFiles.push({
                name: 'css/styles.css',
                content: combinedCSS,
                type: 'text/css'
            });

        } else {
            // Split strategy
            styles.forEach((style, index) => {
                const fileName = `css/style-${index + 1}.css`;
                const content = style.textContent;

                // Create link replacement
                const link = doc.createElement('link');
                link.rel = 'stylesheet';
                link.href = fileName;

                // Preserve media attribute if exists
                if (style.hasAttribute('media')) {
                    link.setAttribute('media', style.getAttribute('media'));
                }

                style.parentNode.replaceChild(link, style);

                generatedFiles.push({
                    name: fileName,
                    content: content,
                    type: 'text/css'
                });
            });
        }

        return generatedFiles;
    }

    /**
     * Extracts inline <script> tags.
     */
    extractScripts(doc, strategy) {
        // Only select scripts that don't have a src attribute (inline scripts)
        const scripts = Array.from(doc.querySelectorAll('script:not([src])'));
        // Exclude type="importmap" or type="application/json" etc, usually we only want JS
        // But for this tool, we'll assume all inline scripts without type or type="text/javascript" or type="module" are targets.

        const validScripts = scripts.filter(s => {
            const type = s.getAttribute('type');
            return !type || type === 'text/javascript' || type === 'module' || type === 'application/javascript';
        });

        const generatedFiles = [];

        if (validScripts.length === 0) {
            this.log("No extractable inline <script> tags found.", "info");
            return generatedFiles;
        }

        this.log(`Found ${validScripts.length} inline script blocks.`, "info");

        if (strategy === 'merge') {
            let combinedJS = "";

            validScripts.forEach((script, index) => {
                combinedJS += `// --- Extracted Block ${index + 1} ---\n`;
                combinedJS += script.textContent + "\n\n";
                script.remove();
            });

            // Add single script tag at the end of body usually, or where the last script was?
            // Safer to append to body for merged app logic.
            const newScript = doc.createElement('script');
            newScript.src = 'js/app.js';
            newScript.defer = true;
            doc.body.appendChild(newScript);

            generatedFiles.push({
                name: 'js/app.js',
                content: combinedJS,
                type: 'text/javascript'
            });

        } else {
            // Split strategy
            validScripts.forEach((script, index) => {
                const fileName = `js/script-${index + 1}.js`;
                const content = script.textContent;

                const newScript = doc.createElement('script');
                newScript.src = fileName;

                // Preserve type (e.g. module)
                if (script.hasAttribute('type')) {
                    newScript.setAttribute('type', script.getAttribute('type'));
                }

                // Replace in place to maintain execution order mostly
                script.parentNode.replaceChild(newScript, script);

                generatedFiles.push({
                    name: fileName,
                    content: content,
                    type: 'text/javascript'
                });
            });
        }

        return generatedFiles;
    }

    /**
     * Extreme Mode: Extracts body innerHTML into a JS file.
     */
    applyExtremeMode(doc) {
        const bodyContent = doc.body.innerHTML;

        // Clear body
        doc.body.innerHTML = '';

        // Add loader script
        const loaderScript = doc.createElement('script');
        loaderScript.src = 'js/dynamic-loader.js';
        loaderScript.defer = true;
        doc.body.appendChild(loaderScript);

        // Escape content for template literal
        // We need to escape backticks and ${
        const safeContent = bodyContent
            .replace(/\\/g, '\\\\') // Escape backslashes first
            .replace(/`/g, '\\`')   // Escape backticks
            .replace(/\$\{/g, '\\${'); // Escape interpolation

        const jsContent = `
/** 
 * Extreme Mode Loader
 * Dynamically injects HTML content into the body.
 */
document.addEventListener('DOMContentLoaded', () => {
    const htmlContent = \`${safeContent}\`;
    document.body.innerHTML = htmlContent;
    console.log("Extreme Mode: Body content injected.");
});
        `.trim();

        return [{
            name: 'js/dynamic-loader.js',
            content: jsContent,
            type: 'text/javascript'
        }];
    }
}