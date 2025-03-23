"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupClaudeAuth = setupClaudeAuth;
/**
 * Set up Claude authentication in a Docker container using a shared volume.
 */
var child_process_1 = require("child_process");
/**
 * Launch an interactive Docker container to set up Claude authentication.
 * Uses a shared Docker volume for credential persistence.
 */
function setupClaudeAuth() {
    return __awaiter(this, void 0, void 0, function () {
        var volumeExistsResult, setupCmd_1, containerIdResult, containerId, attachCmd, attachProcess_1, verifyResult, verifyError_1, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Setting up Claude authentication...");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 11, , 12]);
                    // Check if volume exists, create it if not
                    console.log("Checking for claude_credentials volume...");
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            (0, child_process_1.exec)('docker volume ls --filter name=claude_credentials --format "{{.Name}}"', function (error, stdout) {
                                if (error) {
                                    reject(error);
                                    return;
                                }
                                resolve(stdout.trim());
                            });
                        })];
                case 2:
                    volumeExistsResult = _a.sent();
                    if (!!volumeExistsResult) return [3 /*break*/, 4];
                    console.log("Creating shared claude_credentials volume...");
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            (0, child_process_1.exec)('docker volume create claude_credentials', function (error) {
                                if (error) {
                                    reject(error);
                                    return;
                                }
                                resolve();
                            });
                        })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    setupCmd_1 = "\n      mkdir -p /claude_shared/.claude && \\\n      touch /claude_shared/.claude.json && \\\n      chmod -R 777 /claude_shared && \\\n      rm -rf /home/magi_user/.claude && \\\n      rm -f /home/magi_user/.claude.json && \\\n      ln -sf /claude_shared/.claude /home/magi_user/.claude && \\\n      ln -sf /claude_shared/.claude.json /home/magi_user/.claude.json && \\\n      ls -la /home/magi_user/ | grep claude && \\\n      ls -la /claude_shared/ && \\\n      claude --dangerously-skip-permissions\n    ";
                    // Run the container in interactive mode
                    console.log("Launching interactive container for Claude authentication...");
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            (0, child_process_1.exec)("docker run -d --rm -v claude_credentials:/claude_shared -it magi-system:latest sh -c \"".concat(setupCmd_1, "\""), function (error, stdout) {
                                if (error) {
                                    reject(error);
                                    return;
                                }
                                resolve(stdout.trim());
                            });
                        })];
                case 5:
                    containerIdResult = _a.sent();
                    containerId = containerIdResult;
                    console.log("Claude container started with ID: ".concat(containerId));
                    attachCmd = "docker attach ".concat(containerId);
                    console.log("Running: ".concat(attachCmd));
                    console.log("Follow the prompts to authenticate Claude...");
                    console.log("Press Ctrl+C to exit the authentication process once finished.");
                    attachProcess_1 = (0, child_process_1.spawn)('docker', ['attach', containerId], {
                        stdio: 'inherit',
                        shell: true
                    });
                    return [4 /*yield*/, new Promise(function (resolve) {
                            attachProcess_1.on('exit', function () {
                                console.log("\nAuthentication process completed.");
                                console.log("If you successfully authenticated, Claude credentials are now stored in the shared volume.");
                                resolve();
                            });
                        })];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            (0, child_process_1.exec)('docker run --rm -v claude_credentials:/claude_data:ro alpine:latest sh -c "ls -la /claude_data/.claude/ && cat /claude_data/.claude.json"', function (error, stdout) {
                                if (error) {
                                    reject(error);
                                    return;
                                }
                                resolve(stdout);
                            });
                        })];
                case 8:
                    verifyResult = _a.sent();
                    console.log("Volume contents verification:");
                    console.log(verifyResult);
                    return [3 /*break*/, 10];
                case 9:
                    verifyError_1 = _a.sent();
                    console.log("Could not verify volume contents: ".concat(verifyError_1));
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/, true];
                case 11:
                    error_1 = _a.sent();
                    console.log("Error during Claude authentication: ".concat(error_1));
                    return [2 /*return*/, false];
                case 12: return [2 /*return*/];
            }
        });
    });
}
// Allow running directly
if (require.main === module) {
    setupClaudeAuth().catch(console.error);
}
