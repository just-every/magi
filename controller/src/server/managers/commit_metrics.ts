import { execSync } from 'child_process';
import micromatch from 'micromatch';
import path from 'path';
import { RiskBreakdown, Metrics } from '../../types/index';
import { getDefaultBranch } from '../utils/git_utils';

export interface DiffFile {
    path: string;
    linesChanged?: number; // adds + deletes for this file
    hunk: string; // diff hunk text (now required)
}

const PATH_RISKS = [
    // Database / migrations
    { pattern: 'src/db/**', tag: 'db', weight: 0.25 },
    { pattern: 'migrations/**', tag: 'migrations', weight: 0.25 },

    // Infrastructure & deployment
    { pattern: 'infra/**', tag: 'infra', weight: 0.25 },
    { pattern: 'terraform/**', tag: 'terraform', weight: 0.25 },
    { pattern: 'helm/**', tag: 'helm', weight: 0.25 },

    // Configuration / secrets
    { pattern: 'config/**', tag: 'config', weight: 0.25 },
    { pattern: 'secrets/**', tag: 'secrets', weight: 0.25 },
    { pattern: 'certs/**', tag: 'certs', weight: 0.25 },

    // Security‑critical application code
    { pattern: 'src/security/**', tag: 'security', weight: 0.25 },
    { pattern: 'src/auth/**', tag: 'auth', weight: 0.25 },

    // CI / build system & scripts
    { pattern: '.github/**', tag: 'ci', weight: 0.2 },
    { pattern: '.gitlab/**', tag: 'ci', weight: 0.2 },
    { pattern: 'scripts/**', tag: 'build-scripts', weight: 0.2 },
    { pattern: 'Makefile*', tag: 'build-scripts', weight: 0.2 },
];

const TYPE_RISKS = [
    { ext: '.sql', tag: 'sql', weight: 0.15 },
    { ext: '.tf', tag: 'terraform', weight: 0.15 },
    { ext: 'Dockerfile', tag: 'docker', weight: 0.15 },

    // YAML / YML often used for K8s or CI manifests
    { ext: '.yaml', tag: 'yaml', weight: 0.15 },
    { ext: '.yml', tag: 'yaml', weight: 0.15 },

    // Shell / PowerShell scripts
    { ext: '.sh', tag: 'shell', weight: 0.15 },
    { ext: '.ps1', tag: 'powershell', weight: 0.15 },
];

const PATTERN_RISKS = [
    // Destructive SQL
    { regex: /\bDROP\s+TABLE\b/i, tag: 'drop-table', weight: 0.2 },
    { regex: /\bALTER\s+TABLE\b/i, tag: 'alter-table', weight: 0.2 },
    { regex: /\bTRUNCATE\b/i, tag: 'truncate-table', weight: 0.2 },

    // Auth / crypto changes
    {
        regex: /\b(jwt\.verify|bcrypt\.compareSync)\b/,
        tag: 'auth-change',
        weight: 0.2,
    },

    // Privilege escalation or dangerous shell
    { regex: /\bsetuid\s*\(/, tag: 'native-privilege', weight: 0.2 },
    { regex: /\brm\s+-rf\b/, tag: 'rm-rf', weight: 0.2 },
    { regex: /\bchmod\s+777\b/, tag: 'chmod-777', weight: 0.2 },
    { regex: /\bchown\s+root\b/, tag: 'chown-root', weight: 0.2 },

    // Runtime code execution
    { regex: /\beval\s*\(/, tag: 'eval', weight: 0.2 },
    { regex: /\bexec\s*\(/, tag: 'exec', weight: 0.2 },

    // Hard‑coded credentials / secrets
    { regex: /AKIA[0-9A-Z]{16}/, tag: 'aws-secret', weight: 0.2 },
    {
        regex: /-----BEGIN\s+PRIVATE\s+KEY-----/,
        tag: 'private-key',
        weight: 0.2,
    },

    // TLS / cert bypass
    { regex: /rejectUnauthorized\s*:\s*false/, tag: 'tls-bypass', weight: 0.2 },
    { regex: /insecureSkipVerify\s*=\s*true/, tag: 'tls-bypass', weight: 0.2 },
];

const ALLOW_LIST = ['docs/**', 'assets/**', '**/*.md'];

function scanRisk(diffFiles: DiffFile[]): RiskBreakdown {
    let score = 0;
    const pathRisk: string[] = [];
    const typeRisk: string[] = [];
    const patternRisk: string[] = [];
    let dependencyFileChanged = false;
    let allowListed = true;

    for (const f of diffFiles) {
        const { path, hunk } = f; // assume you captured the diff hunk text

        // 1. allow-list check
        if (!micromatch.isMatch(path, ALLOW_LIST)) allowListed = false;

        // 2. path buckets
        PATH_RISKS.forEach(r => {
            if (micromatch.isMatch(path, r.pattern)) {
                if (!pathRisk.includes(r.tag)) {
                    pathRisk.push(r.tag);
                    score += r.weight;
                }
            }
        });

        // 3. file-type buckets
        TYPE_RISKS.forEach(r => {
            if (path.endsWith(r.ext)) {
                if (!typeRisk.includes(r.tag)) {
                    typeRisk.push(r.tag);
                    score += r.weight;
                }
            }
        });

        // 4. high-risk regex
        PATTERN_RISKS.forEach(r => {
            if (r.regex.test(hunk)) {
                if (!patternRisk.includes(r.tag)) {
                    patternRisk.push(r.tag);
                    score += r.weight;
                }
            }
        });

        // 5. dependency files
        const depFiles = [
            'package.json',
            'package-lock.json',
            'requirements.txt',
            'pom.xml',
            'go.mod',
            'go.sum',
        ];
        if (depFiles.includes(path)) dependencyFileChanged = true;
    }

    if (dependencyFileChanged) score += 0.3;
    if (allowListed) score -= 1;

    return {
        totalRiskScore: Math.min(Math.max(score, 0), 1),
        pathRisk,
        typeRisk,
        patternRisk,
        dependencyFileChanged,
        allowListed,
    };
}

/* =============================================================================
 * Shannon entropy (0 = all edits in one file)
 * ===========================================================================*/
function calcChangeEntropy(diffFiles: DiffFile[]): number {
    const total = diffFiles.reduce((s, f) => s + f.linesChanged, 0);
    if (!total) return 0;
    return diffFiles.reduce((h, f) => {
        const p = f.linesChanged / total;
        return p ? h - p * Math.log2(p) : h;
    }, 0);
}

// --- helper functions and weights for new metrics ---
function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
}
function norm(x: number, min: number, max: number) {
    if (max <= min) return 0;
    return clamp01((x - min) / (max - min));
}
/* ---------------------------------------------------------------------- */
/*  Optional dynamic baseline: derive p90 from recent merge history       */
/* ---------------------------------------------------------------------- */
function percentile(arr: number[], p: number): number {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
}

function deriveP90FromHistory(repoPath: string, depth = 50) {
    try {
        const defaultBranch = getDefaultBranch(repoPath);
        // last `depth` merge commits on default branch (fast, no remote access)
        const shas = execSync(
            `git -C "${repoPath}" log --merges --pretty=%H -n ${depth} ${defaultBranch}`,
            { encoding: 'utf8' }
        )
            .trim()
            .split('\n')
            .filter(Boolean);

        if (shas.length < 5) return null; // not enough data

        const filesArr: number[] = [];
        const linesArr: number[] = [];
        const dirArr: number[] = [];
        const churnArr: number[] = [];

        for (const sha of shas) {
            const numstat = execSync(
                `git -C "${repoPath}" diff --numstat ${sha}~1 ${sha}`,
                { encoding: 'utf8' }
            )
                .trim()
                .split('\n')
                .filter(Boolean);

            let adds = 0,
                dels = 0,
                files = 0;
            const dirs = new Set<string>();

            numstat.forEach(l => {
                const [a, d, file] = l.split('\t');
                // Handle binary files correctly (numstat shows '-' for binary files)
                const addCount = a === '-' ? 0 : parseInt(a, 10) || 0;
                const delCount = d === '-' ? 0 : parseInt(d, 10) || 0;
                adds += addCount;
                dels += delCount;
                files++;
                dirs.add(path.dirname(file));
            });

            filesArr.push(files);
            linesArr.push(adds + dels);
            dirArr.push(dirs.size);
            // Guard against division by zero
            if (adds > 0) {
                const churn = (adds + dels) / adds;
                if (Number.isFinite(churn)) {
                    churnArr.push(churn);
                }
            }
        }

        return {
            files: percentile(filesArr, 90) || p90.files,
            lines: percentile(linesArr, 90) || p90.lines,
            churn: percentile(churnArr, 90) || p90.churn,
            dir: percentile(dirArr, 90) || p90.dir,
            cyclo: p90.cyclo, // keep default; CC expensive to compute repo‑wide
        };
    } catch {
        return null; // any git failure → fallback to static
    }
}
/* ---------------------------------------------------------------------- */
/*  p90 baselines (static defaults, env‑overridable)                      */
/*  Designed to work even when the repo has zero history.                 */
/* ---------------------------------------------------------------------- */
const p90 = {
    files: parseInt(process.env.P90_FILES ?? '15', 10), // touch ≥15 files = large
    lines: parseInt(process.env.P90_LINES ?? '800', 10), // ≥800 added+deleted LOC
    churn: parseInt(process.env.P90_CHURN ?? '3', 10), // (adds+dels)/adds ≥3
    dir: parseInt(process.env.P90_DIR ?? '6', 10), // ≥6 different directories
    cyclo: parseInt(process.env.P90_CYCLO ?? '20', 10), // Δ cyclomatic complexity ≥20
};
/* Default weight table (env overrides take precedence) */
const W = {
    files: parseFloat(process.env.W_FILES ?? '0.10'),
    loc: parseFloat(process.env.W_LOC ?? '0.10'),
    entropy: parseFloat(process.env.W_ENTROPY ?? '0.10'),
    churn: parseFloat(process.env.W_CHURN ?? '0.10'),
    dispersion: parseFloat(process.env.W_DISPERSION ?? '0.05'),
    complexity: parseFloat(process.env.W_COMPLEXITY ?? '0.10'),
    unfamiliar: parseFloat(process.env.W_UNFAMILIAR ?? '0.10'),
    hazard: parseFloat(process.env.W_HAZARD ?? '0.15'),
    secret: parseFloat(process.env.W_SECRET ?? '0.15'),
    semantic: parseFloat(process.env.W_SEMANTIC ?? '0.05'),
};

/** Compute metrics for branch‑vs‑default-branch diff */
export function computeMetrics(repoPath: string): Metrics {
    // Get the default branch for this repository
    const defaultBranch = getDefaultBranch(repoPath);

    // attempt dynamic baselines; fallback to static if history thin
    const dyn = deriveP90FromHistory(repoPath);
    const baseline = dyn ?? p90;

    // Get the merge-base as our base of comparison
    const base = execSync(`git merge-base origin/${defaultBranch} HEAD`, {
        cwd: repoPath,
    })
        .toString()
        .trim();

    // Always explicitly diff against HEAD to avoid including uncommitted changes
    const fileList = execSync(`git diff --name-only ${base} HEAD`, {
        cwd: repoPath,
    })
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);

    // numstat for adds/dels per file
    const numstat = execSync(`git diff --numstat ${base} HEAD`, {
        cwd: repoPath,
    })
        .toString()
        .trim()
        .split('\n');

    let totalAdds = 0,
        totalDels = 0,
        hunks = 0;
    const diffFiles: DiffFile[] = [];

    for (const line of numstat) {
        if (!line) continue;
        const [adds, dels, file] = line.split('\t');

        // Handle binary files correctly (numstat shows '-' for binary files)
        const a = adds === '-' ? 0 : parseInt(adds, 10) || 0;
        const d = dels === '-' ? 0 : parseInt(dels, 10) || 0;

        // Always diff against HEAD
        const hunk = execSync(`git diff -U0 ${base} HEAD -- "${file}"`, {
            cwd: repoPath,
        }).toString();
        hunks += (hunk.match(/^@@/gm) || []).length;

        // Ensure linesChanged is always a number
        diffFiles.push({ path: file, linesChanged: a + d, hunk });
        totalAdds += a;
        totalDels += d;
    }

    /* --- calculate raw stats --- */
    const filesChanged = fileList.length;
    const totalLines = totalAdds + totalDels;
    const churnRatio = totalAdds ? (totalAdds + totalDels) / totalAdds : 1;
    const directoryCount = new Set(fileList.map(f => path.dirname(f))).size;
    const entropyRaw = calcChangeEntropy(diffFiles);
    const entropyNormalised =
        filesChanged > 1 ? entropyRaw / Math.log2(filesChanged) : 0;

    /* --- developer familiarity (simple heuristic) --- */
    let unfamiliar = 1;
    try {
        const author = execSync('git log -1 --pretty=%ae', { cwd: repoPath })
            .toString()
            .trim();
        // Escape author email for grep pattern
        const safeAuthor = author.replace(/'/g, "'\\''");

        let touched = 0,
            authored = 0;
        for (const f of fileList) {
            touched++;
            const count = parseInt(
                execSync(
                    `git log --follow --pretty=%ae -- "${f}" | grep -F -c -- '${safeAuthor}' || true`,
                    { cwd: repoPath, shell: '/bin/bash' }
                ).toString() || '0',
                10
            );
            if (count > 0) authored++;
        }
        unfamiliar = 1 - authored / Math.max(touched, 1);
    } catch (err) {
        console.warn(
            '[commit-metrics] Failed to calculate developer familiarity:',
            err
        );
    }

    /* --- cheap AST + regex checks --- */
    const secretRegex = /(AWS[_A-Z0-9]{10,}|PRIVATE[_A-Z]*KEY|-----BEGIN)/;
    const apiSigRegex =
        /^\+\s*(export\s+)?(async\s+)?function\s+[a-zA-Z0-9_]+\s*\(/m;
    const ctrlFlowRegex = /^\+\s*(if|for|while|switch)\s*\(/m;
    let secretHits = 0,
        apiEdits = 0,
        ctrlEdits = 0,
        cycloDelta = 0;

    for (const { hunk } of diffFiles) {
        if (secretRegex.test(hunk)) secretHits++;
        if (apiSigRegex.test(hunk)) apiEdits++;
        if (ctrlFlowRegex.test(hunk)) ctrlEdits++;
        // rough CC delta: count added branching keywords
        cycloDelta += (hunk.match(/^\+\s*(if|for|while|case\s|catch)/gm) || [])
            .length;
    }

    /* --- existing risk breakdown --- */
    const risk: RiskBreakdown = scanRisk(diffFiles);

    /* --- weighted score --- */
    const score = clamp01(
        W.files * norm(filesChanged, 0, baseline.files) +
            W.loc * norm(totalLines, 0, baseline.lines) +
            W.entropy * entropyNormalised +
            W.churn * norm(churnRatio, 1, baseline.churn) +
            W.dispersion * norm(directoryCount, 1, baseline.dir) +
            W.complexity * norm(cycloDelta, 0, baseline.cyclo) +
            W.unfamiliar * unfamiliar +
            W.hazard * risk.totalRiskScore +
            W.secret * (secretHits ? 1 : 0) +
            W.semantic * (apiEdits + ctrlEdits ? 0.7 : 0)
    );

    return {
        filesChanged,
        totalLines,
        directoryCount,
        hunks,
        entropyNormalised,
        churnRatio,
        cyclomaticDelta: cycloDelta,
        developerUnfamiliarity: unfamiliar,
        secretRegexHits: secretHits,
        apiSignatureEdits: apiEdits,
        controlFlowEdits: ctrlEdits,
        risk,
        score,
    };
}
