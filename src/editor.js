import * as monaco from 'monaco-editor';

// Monaco Editor requires worker configuration for Vite
self.MonacoEnvironment = {
    getWorker: function (workerId, label) {
        const getWorkerModule = (moduleUrl, label) => {
            return new Worker(self.MonacoEnvironment.getWorkerUrl(moduleUrl), {
                name: label,
                type: 'module'
            });
        };
        switch (label) {
            case 'json':
                return getWorkerModule('/monaco-editor/esm/vs/language/json/json.worker?worker', label);
            case 'css':
            case 'scss':
            case 'less':
                return getWorkerModule('/monaco-editor/esm/vs/language/css/css.worker?worker', label);
            case 'html':
            case 'handlebars':
            case 'razor':
                return getWorkerModule('/monaco-editor/esm/vs/language/html/html.worker?worker', label);
            case 'typescript':
            case 'javascript':
                return getWorkerModule('/monaco-editor/esm/vs/language/typescript/ts.worker?worker', label);
            default:
                return getWorkerModule('/monaco-editor/esm/vs/editor/editor.worker?worker', label);
        }
    }
};

export class CodeEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.editor = null;
        this.currentLanguage = 'javascript';
    }

    initialize(initialCode = '', language = 'javascript') {
        this.currentLanguage = language;

        // Map our language names to Monaco language IDs
        const languageMap = {
            'javascript': 'javascript',
            'python': 'python',
            'java': 'java'
        };

        this.editor = monaco.editor.create(this.container, {
            value: initialCode,
            language: languageMap[language] || 'javascript',
            theme: 'vs-dark',
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16, bottom: 16 },
            fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
            fontLigatures: true,
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            tabSize: 2,
            wordWrap: 'on'
        });

        return this.editor;
    }

    setCode(code, language) {
        if (this.editor) {
            const model = this.editor.getModel();
            monaco.editor.setModelLanguage(model, language);
            this.editor.setValue(code);
            this.currentLanguage = language;
        }
    }

    getCode() {
        return this.editor ? this.editor.getValue() : '';
    }

    dispose() {
        if (this.editor) {
            this.editor.dispose();
        }
    }
}
