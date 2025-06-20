/**
 * Enhanced security analyzer for patches using ESLint security plugin
 * and targeted pattern matching for non-JavaScript files
 */

import { ESLint } from 'eslint';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

export interface SecurityAnalysisResult {
    securityRisks: SecurityRisk[];
    performanceIssues: PerformanceIssue[];
    codeQualityIssues: CodeQualityIssue[];
    dependencies: string[];
}

export interface SecurityRisk {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    file?: string;
    line?: number;
}

export interface PerformanceIssue {
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
}

export interface CodeQualityIssue {
    type: string;
    description: string;
}

/**
 * Analyze JavaScript/TypeScript files using ESLint security plugin
 */
async function analyzeJavaScriptSecurity(
    content: string,
    filename: string
): Promise<{
    securityRisks: SecurityRisk[];
    performanceIssues: PerformanceIssue[];
}> {
    const risks: SecurityRisk[] = [];
    const performanceIssues: PerformanceIssue[] = [];

    // Run ESLint security checks
    try {
        const eslint = new ESLint({
            baseConfig: {
                plugins: ['security'] as any,
                rules: {
                    'security/detect-eval-with-expression': 'error',
                    'security/detect-non-literal-regexp': 'error',
                    'security/detect-non-literal-require': 'error',
                    'security/detect-object-injection': 'warn',
                    'security/detect-possible-timing-attacks': 'warn',
                    'security/detect-unsafe-regex': 'error',
                },
                parserOptions: {
                    ecmaVersion: 2022,
                    sourceType: 'module',
                },
            } as any,
        });

        const results = await eslint.lintText(content, { filePath: filename });

        for (const result of results) {
            for (const message of result.messages) {
                if (message.ruleId?.startsWith('security/')) {
                    risks.push({
                        type: message.ruleId,
                        severity: message.severity === 2 ? 'high' : 'medium',
                        description: message.message,
                        file: filename,
                        line: message.line,
                    });
                }
            }
        }
    } catch (error) {
        console.error('ESLint security check failed:', error);
    }

    // Parse with Babel for additional analysis
    try {
        const ast = parser.parse(content, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx'] as any,
            errorRecovery: true,
        });

        traverse(ast, {
            // Detect eval and dangerous functions
            CallExpression(path) {
                const callee = path.node.callee;

                // Check for eval and Function constructor
                if (callee.type === 'Identifier') {
                    if (callee.name === 'eval') {
                        risks.push({
                            type: 'eval-usage',
                            severity: 'critical',
                            description:
                                'Use of eval() can lead to code injection vulnerabilities',
                            file: filename,
                            line: path.node.loc?.start.line,
                        });
                    } else if (callee.name === 'Function') {
                        risks.push({
                            type: 'function-constructor',
                            severity: 'critical',
                            description:
                                'Function constructor can execute arbitrary code',
                            file: filename,
                            line: path.node.loc?.start.line,
                        });
                    }
                }

                // Check for dangerous timer usage
                if (
                    callee.type === 'Identifier' &&
                    (callee.name === 'setTimeout' ||
                        callee.name === 'setInterval') &&
                    path.node.arguments.length > 0 &&
                    path.node.arguments[0].type === 'StringLiteral'
                ) {
                    risks.push({
                        type: 'string-timer',
                        severity: 'high',
                        description: `${callee.name} with string argument can execute arbitrary code`,
                        file: filename,
                        line: path.node.loc?.start.line,
                    });
                }

                // Check for sync file operations
                if (
                    path.node.callee.type === 'MemberExpression' &&
                    path.node.callee.object.type === 'Identifier' &&
                    path.node.callee.object.name === 'fs' &&
                    path.node.callee.property.type === 'Identifier'
                ) {
                    const methodName = path.node.callee.property.name;
                    const syncMethods = [
                        'readFileSync',
                        'writeFileSync',
                        'appendFileSync',
                        'mkdirSync',
                        'rmdirSync',
                        'unlinkSync',
                    ];

                    if (syncMethods.includes(methodName)) {
                        performanceIssues.push({
                            type: 'sync-file-operation',
                            description: `Synchronous file operation ${methodName} blocks the event loop`,
                            impact: 'high',
                        });
                    }
                }
            },

            // Detect __proto__ usage (prototype pollution)
            MemberExpression(path) {
                if (
                    (path.node.property.type === 'Identifier' &&
                        path.node.property.name === '__proto__') ||
                    (path.node.property.type === 'StringLiteral' &&
                        path.node.property.value === '__proto__')
                ) {
                    risks.push({
                        type: 'prototype-pollution',
                        severity: 'high',
                        description:
                            'Potential prototype pollution vulnerability',
                        file: filename,
                        line: path.node.loc?.start.line,
                    });
                }

                // Check for process.env access
                if (
                    path.node.object.type === 'Identifier' &&
                    path.node.object.name === 'process' &&
                    path.node.property.type === 'Identifier' &&
                    path.node.property.name === 'env'
                ) {
                    risks.push({
                        type: 'env-access',
                        severity: 'low',
                        description:
                            'Accessing environment variables may expose sensitive data',
                        file: filename,
                        line: path.node.loc?.start.line,
                    });
                }
            },

            // Detect unbounded loops
            WhileStatement(path) {
                if (
                    path.node.test.type === 'BooleanLiteral' &&
                    path.node.test.value === true
                ) {
                    performanceIssues.push({
                        type: 'infinite-loop',
                        description:
                            'while(true) loop detected - ensure proper exit conditions',
                        impact: 'high',
                    });
                }
            },
        });
    } catch (parseError) {
        console.error(`Failed to parse ${filename}:`, parseError);
    }

    return { securityRisks: risks, performanceIssues };
}

/**
 * Analyze SQL files for dangerous patterns
 */
function analyzeSQLSecurity(content: string, filename: string): SecurityRisk[] {
    const risks: SecurityRisk[] = [];
    const lines = content.split('\n');

    const dangerousPatterns = [
        {
            pattern: /DROP\s+TABLE/i,
            type: 'drop-table',
            description: 'DROP TABLE statement can delete data permanently',
        },
        {
            pattern: /TRUNCATE/i,
            type: 'truncate',
            description: 'TRUNCATE statement removes all data from table',
        },
        {
            pattern: /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i,
            type: 'delete-all',
            description: 'DELETE with always-true condition',
        },
        {
            pattern: /UPDATE.*SET.*WHERE\s+1\s*=\s*1/i,
            type: 'update-all',
            description: 'UPDATE with always-true condition',
        },
        {
            pattern: /GRANT\s+ALL/i,
            type: 'grant-all',
            description: 'Granting all privileges is dangerous',
        },
        {
            pattern: /CREATE\s+USER.*IDENTIFIED\s+BY\s+['"][^'"]+['"]/i,
            type: 'hardcoded-password',
            description: 'Hardcoded password in SQL',
        },
    ];

    lines.forEach((line, index) => {
        for (const { pattern, type, description } of dangerousPatterns) {
            if (pattern.test(line)) {
                risks.push({
                    type: `sql-${type}`,
                    severity: 'high',
                    description,
                    file: filename,
                    line: index + 1,
                });
            }
        }
    });

    return risks;
}

/**
 * Analyze shell scripts for dangerous patterns
 */
function analyzeShellSecurity(
    content: string,
    filename: string
): SecurityRisk[] {
    const risks: SecurityRisk[] = [];
    const lines = content.split('\n');

    const dangerousPatterns = [
        {
            pattern: /rm\s+-rf\s+\//i,
            type: 'rm-root',
            description: 'Dangerous rm -rf on root directory',
            severity: 'critical' as const,
        },
        {
            pattern: /rm\s+-rf/i,
            type: 'rm-rf',
            description: 'rm -rf can permanently delete files',
            severity: 'high' as const,
        },
        {
            pattern: /eval\s+/i,
            type: 'eval',
            description: 'eval in shell scripts can execute arbitrary code',
            severity: 'high' as const,
        },
        {
            pattern: /sudo\s+/i,
            type: 'sudo',
            description: 'sudo grants elevated privileges',
            severity: 'medium' as const,
        },
        {
            pattern: /curl.*\|\s*sh/i,
            type: 'curl-pipe-sh',
            description: 'Piping curl to sh is dangerous',
            severity: 'critical' as const,
        },
        {
            pattern: /wget.*\|\s*sh/i,
            type: 'wget-pipe-sh',
            description: 'Piping wget to sh is dangerous',
            severity: 'critical' as const,
        },
        {
            pattern: /chmod\s+777/i,
            type: 'chmod-777',
            description: 'chmod 777 gives full permissions to everyone',
            severity: 'high' as const,
        },
    ];

    lines.forEach((line, index) => {
        // Skip comments
        if (line.trim().startsWith('#')) return;

        for (const {
            pattern,
            type,
            description,
            severity,
        } of dangerousPatterns) {
            if (pattern.test(line)) {
                risks.push({
                    type: `shell-${type}`,
                    severity,
                    description,
                    file: filename,
                    line: index + 1,
                });
            }
        }
    });

    return risks;
}

/**
 * Analyze patch content for security and quality issues
 */
export async function analyzePatchSecurity(
    patchContent: string
): Promise<SecurityAnalysisResult> {
    const allSecurityRisks: SecurityRisk[] = [];
    const allPerformanceIssues: PerformanceIssue[] = [];
    const allCodeQualityIssues: CodeQualityIssue[] = [];
    const dependencies: string[] = [];

    // Extract file contents from patch
    const fileContents = extractFileContentsFromPatch(patchContent);

    for (const { filename, content, isNewFile } of fileContents) {
        // Skip binary files
        if (isBinaryFile(content)) {
            if (isNewFile) {
                allCodeQualityIssues.push({
                    type: 'binary-file',
                    description: `Binary file added: ${filename}`,
                });
            }
            continue;
        }

        // Analyze based on file type
        if (isJavaScriptFile(filename)) {
            const { securityRisks, performanceIssues } =
                await analyzeJavaScriptSecurity(content, filename);
            allSecurityRisks.push(...securityRisks);
            allPerformanceIssues.push(...performanceIssues);
        } else if (isSQLFile(filename)) {
            const sqlRisks = analyzeSQLSecurity(content, filename);
            allSecurityRisks.push(...sqlRisks);
        } else if (isShellFile(filename)) {
            const shellRisks = analyzeShellSecurity(content, filename);
            allSecurityRisks.push(...shellRisks);
        }

        // Check for common security issues in any file type
        const commonRisks = analyzeCommonSecurityPatterns(content, filename);
        allSecurityRisks.push(...commonRisks);
    }

    // Additional quality checks
    const largeFileCount = fileContents.filter(
        f => f.content.split('\n').length > 1000
    ).length;
    if (largeFileCount > 0) {
        allCodeQualityIssues.push({
            type: 'large-files',
            description: `${largeFileCount} files with over 1000 lines`,
        });
    }

    return {
        securityRisks: allSecurityRisks,
        performanceIssues: allPerformanceIssues,
        codeQualityIssues: allCodeQualityIssues,
        dependencies,
    };
}

/**
 * Analyze common security patterns across all file types
 */
function analyzeCommonSecurityPatterns(
    content: string,
    filename: string
): SecurityRisk[] {
    const risks: SecurityRisk[] = [];
    const lines = content.split('\n');

    // Common patterns that might appear in any file
    const patterns = [
        {
            pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
            type: 'private-key',
            description: 'Private key detected',
        },
        {
            pattern: /AKIA[0-9A-Z]{16}/g,
            type: 'aws-key',
            description: 'AWS access key detected',
        },
        {
            pattern: /[a-zA-Z0-9_]{40}/,
            type: 'potential-token',
            description: 'Potential API token (40 chars)',
        },
        {
            pattern: /password\s*[:=]\s*["'][^"']+["']/i,
            type: 'hardcoded-password',
            description: 'Hardcoded password detected',
        },
        {
            pattern: /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
            type: 'api-key',
            description: 'API key detected',
        },
    ];

    lines.forEach((line, index) => {
        for (const { pattern, type, description } of patterns) {
            if (pattern.test(line)) {
                // Skip if it's in a comment
                const trimmedLine = line.trim();
                if (
                    trimmedLine.startsWith('//') ||
                    trimmedLine.startsWith('#') ||
                    trimmedLine.startsWith('*')
                ) {
                    continue;
                }

                risks.push({
                    type: `credential-${type}`,
                    severity: 'critical',
                    description,
                    file: filename,
                    line: index + 1,
                });
            }
        }
    });

    return risks;
}

/**
 * Extract file contents from a git patch
 */
function extractFileContentsFromPatch(
    patchContent: string
): Array<{ filename: string; content: string; isNewFile: boolean }> {
    const files: Array<{
        filename: string;
        content: string;
        isNewFile: boolean;
    }> = [];
    const filePatches = patchContent.split(/^diff --git /m).slice(1);

    for (const filePatch of filePatches) {
        const filenameMatch = filePatch.match(/a\/(.+?) b\//);
        if (!filenameMatch) continue;

        const filename = filenameMatch[1];
        const isNewFile = filePatch.includes('new file mode');
        const lines = filePatch.split('\n');
        const content: string[] = [];
        let inHunk = false;

        for (const line of lines) {
            if (line.startsWith('@@')) {
                inHunk = true;
                continue;
            }
            if (inHunk && line.startsWith('+') && !line.startsWith('+++')) {
                content.push(line.substring(1));
            } else if (inHunk && !line.startsWith('-')) {
                content.push(line);
            }
        }

        if (content.length > 0 || isNewFile) {
            files.push({ filename, content: content.join('\n'), isNewFile });
        }
    }

    return files;
}

/**
 * Check if content appears to be binary
 */
function isBinaryFile(content: string): boolean {
    // Check for null bytes or high concentration of non-printable characters
    const nullBytes = content.includes('\0');
    // eslint-disable-next-line no-control-regex
    const nonPrintable = content.match(/[\x00-\x08\x0E-\x1F\x7F-\xFF]/g);
    const nonPrintableRatio = nonPrintable
        ? nonPrintable.length / content.length
        : 0;

    return nullBytes || nonPrintableRatio > 0.3;
}

/**
 * Check if a file is JavaScript/TypeScript
 */
function isJavaScriptFile(filename: string): boolean {
    const jsExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
    return jsExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

/**
 * Check if a file is SQL
 */
function isSQLFile(filename: string): boolean {
    return (
        filename.toLowerCase().endsWith('.sql') ||
        filename.toLowerCase().includes('migration')
    );
}

/**
 * Check if a file is a shell script
 */
function isShellFile(filename: string): boolean {
    const shellExtensions = ['.sh', '.bash', '.zsh'];
    return (
        shellExtensions.some(ext => filename.toLowerCase().endsWith(ext)) ||
        filename.toLowerCase().includes('dockerfile') ||
        filename.toLowerCase().endsWith('.yml') ||
        filename.toLowerCase().endsWith('.yaml')
    );
}
