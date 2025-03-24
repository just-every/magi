"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_output_dir = get_output_dir;
exports.get_working_dir = get_working_dir;
exports.move_to_working_dir = move_to_working_dir;
exports.mount_magi_code = mount_magi_code;
exports.read_file = read_file;
exports.write_file = write_file;
exports.mount_directory = mount_directory;
exports.getFileTools = getFileTools;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tool_call_js_1 = require("./tool_call.js");
let processDirectory = null;
function get_output_dir(subdirectory) {
    if (!processDirectory) {
        processDirectory = path_1.default.join('/magi_output', process.env.PROCESS_ID);
        console.log(`Output directory created: ${processDirectory}`);
    }
    const outputDirectory = path_1.default.join(processDirectory, subdirectory);
    fs_1.default.mkdirSync(outputDirectory, { recursive: true });
    return outputDirectory;
}
function get_working_dir() { return get_output_dir('working'); }
function move_to_working_dir() {
    process.chdir(get_working_dir());
}
function mount_magi_code() {
    mount_directory('/magi-system');
}
function read_file(filePath) {
    try {
        return fs_1.default.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        throw new Error(`Error reading file ${filePath}: ${error}`);
    }
}
function write_file(filePath, content) {
    try {
        const directory = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(directory)) {
            fs_1.default.mkdirSync(directory, { recursive: true });
        }
        if (typeof content === 'string') {
            fs_1.default.writeFileSync(filePath, content, 'utf-8');
        }
        else {
            fs_1.default.writeFileSync(filePath, Buffer.from(content));
        }
        return `File written successfully to ${filePath}`;
    }
    catch (error) {
        throw new Error(`Error writing file ${filePath}: ${error}`);
    }
}
function mount_directory(sourcePath, destName) {
    if (!fs_1.default.existsSync(sourcePath)) {
        throw new Error(`Error: Source directory ${sourcePath} does not exist`);
    }
    const targetName = destName || path_1.default.basename(sourcePath);
    const targetPath = path_1.default.join(get_working_dir(), targetName);
    if (!fs_1.default.existsSync(targetPath)) {
        fs_1.default.mkdirSync(targetPath, { recursive: true });
    }
    fs_1.default.cpSync(sourcePath, targetPath, { recursive: true });
    return targetPath;
}
function getFileTools() {
    return [
        (0, tool_call_js_1.createToolFunction)(read_file, 'Read a file from the file system', { 'filePath': 'Path to the file to read' }, 'File contents as a string'),
        (0, tool_call_js_1.createToolFunction)(write_file, 'Write content to a file', { 'filePath': 'Path to write the file to', 'content': 'Content to write to the file' }, 'Success message with the path'),
    ];
}
//# sourceMappingURL=file_utils.js.map