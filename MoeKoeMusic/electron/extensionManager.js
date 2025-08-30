import { session, app } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log';
import { fileURLToPath } from 'url';
import isDev from 'electron-is-dev';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Chrome 插件管理 - 根据环境选择正确的路径
const EXTENSIONS_DIR = !isDev
    ? path.join(process.resourcesPath, '..' ,'plugins', 'extensions')
    : path.join(__dirname, '../plugins/extensions');

/**
 * 加载 Chrome 插件
 */
export function loadChromeExtensions() {
    if (!fs.existsSync(EXTENSIONS_DIR)) {
        fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
        log.info('创建插件目录:', EXTENSIONS_DIR);
    }

    try {
        const extensionDirs = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const extensionDir of extensionDirs) {
            const extensionPath = path.join(EXTENSIONS_DIR, extensionDir);
            const manifestPath = path.join(extensionPath, 'manifest.json');
            
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    
                    // 验证 manifest 格式
                    if (manifest.manifest_version && manifest.name && manifest.version) {
                        session.defaultSession.loadExtension(extensionPath, {
                            allowFileAccess: true
                        }).then((extension) => {
                            log.info(`成功加载插件: ${manifest.name} (${extension.id})`);
                        }).catch((error) => {
                            log.error(`加载插件失败 ${extensionDir}:`, error);
                        });
                    } else {
                        log.warn(`插件 ${extensionDir} 的 manifest.json 格式不正确`);
                    }
                } catch (error) {
                    log.error(`解析插件 ${extensionDir} 的 manifest.json 失败:`, error);
                }
            } else {
                log.warn(`插件目录 ${extensionDir} 缺少 manifest.json 文件`);
            }
        }
    } catch (error) {
        log.error('扫描插件目录失败:', error);
    }
}

/**
 * 卸载所有插件
 */
export function unloadChromeExtensions() {
    try {
        const extensions = session.defaultSession.getAllExtensions();
        extensions.forEach(extension => {
            session.defaultSession.removeExtension(extension.id);
            log.info(`卸载插件: ${extension.name}`);
        });
    } catch (error) {
        log.error('卸载插件失败:', error);
    }
}

/**
 * 获取已加载的插件列表
 */
export function getLoadedExtensions() {
    try {
        return session.defaultSession.getAllExtensions();
    } catch (error) {
        log.error('获取插件列表失败:', error);
        return [];
    }
}

/**
 * 安装单个插件
 * @param {string} extensionPath 插件路径
 */
export async function installExtension(extensionPath) {
    try {
        const extension = await session.defaultSession.loadExtension(extensionPath, {
            allowFileAccess: true
        });
        log.info(`手动安装插件成功: ${extension.name}`);
        return { success: true, extension: { id: extension.id, name: extension.name } };
    } catch (error) {
        log.error('手动安装插件失败:', error);
        return { success: false, message: error.message };
    }
}

/**
 * 卸载单个插件
 * @param {string} extensionId 插件ID
 */
export function uninstallExtension(extensionId) {
    try {
        session.defaultSession.removeExtension(extensionId);
        log.info(`卸载插件: ${extensionId}`);
        return { success: true };
    } catch (error) {
        log.error('卸载插件失败:', error);
        return { success: false, message: error.message };
    }
}

/**
 * 重新加载所有插件
 */
export function reloadExtensions() {
    try {
        unloadChromeExtensions();
        loadChromeExtensions();
        return { success: true, message: '插件重新加载成功' };
    } catch (error) {
        log.error('重新加载插件失败:', error);
        return { success: false, message: error.message };
    }
}

/**
 * 获取插件目录路径
 */
export function getExtensionsDirectory() {
    return EXTENSIONS_DIR;
}

/**
 * 检查插件目录是否存在
 */
export function ensureExtensionsDirectory() {
    if (!fs.existsSync(EXTENSIONS_DIR)) {
        fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
        log.info('创建插件目录:', EXTENSIONS_DIR);
    }
    return EXTENSIONS_DIR;
}

/**
 * 验证插件清单文件
 * @param {string} manifestPath manifest.json 文件路径
 */
export function validateManifest(manifestPath) {
    try {
        if (!fs.existsSync(manifestPath)) {
            return { valid: false, error: 'manifest.json 文件不存在' };
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // 检查必需字段
        const requiredFields = ['manifest_version', 'name', 'version'];
        for (const field of requiredFields) {
            if (!manifest[field]) {
                return { valid: false, error: `缺少必需字段: ${field}` };
            }
        }

        // 检查 manifest 版本
        if (manifest.manifest_version !== 3) {
            return { valid: false, error: '仅支持 Manifest V3 格式' };
        }

        return { valid: true, manifest };
    } catch (error) {
        return { valid: false, error: `解析 manifest.json 失败: ${error.message}` };
    }
}

/**
 * 获取插件详细信息
 * @param {string} extensionDir 插件目录名
 */
export function getExtensionInfo(extensionDir) {
    const extensionPath = path.join(EXTENSIONS_DIR, extensionDir);
    const manifestPath = path.join(extensionPath, 'manifest.json');
    
    const validation = validateManifest(manifestPath);
    if (!validation.valid) {
        return { error: validation.error };
    }

    const manifest = validation.manifest;
    const stats = fs.statSync(extensionPath);
    
    return {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description || '',
        author: manifest.author || '',
        permissions: manifest.permissions || [],
        path: extensionPath,
        size: getDirectorySize(extensionPath),
        lastModified: stats.mtime,
        manifest: manifest
    };
}

/**
 * 获取目录大小
 * @param {string} dirPath 目录路径
 */
function getDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
        const files = fs.readdirSync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            
            if (stats.isDirectory()) {
                totalSize += getDirectorySize(filePath);
            } else {
                totalSize += stats.size;
            }
        }
    } catch (error) {
        log.error('计算目录大小失败:', error);
    }
    
    return totalSize;
}

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 扫描并获取所有插件信息
 */
export function scanExtensions() {
    ensureExtensionsDirectory();
    
    try {
        const extensionDirs = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const extensions = [];
        
        for (const extensionDir of extensionDirs) {
            const info = getExtensionInfo(extensionDir);
            if (!info.error) {
                extensions.push({
                    ...info,
                    directory: extensionDir,
                    installed: isExtensionInstalled(info.name)
                });
            } else {
                log.warn(`插件 ${extensionDir} 信息获取失败:`, info.error);
            }
        }
        
        return extensions;
    } catch (error) {
        log.error('扫描插件失败:', error);
        return [];
    }
}

/**
 * 检查插件是否已安装
 * @param {string} extensionName 插件名称
 */
function isExtensionInstalled(extensionName) {
    try {
        const loadedExtensions = getLoadedExtensions();
        return loadedExtensions.some(ext => ext.name === extensionName);
    } catch (error) {
        return false;
    }
}

// 默认导出所有功能
export default {
    loadChromeExtensions,
    unloadChromeExtensions,
    getLoadedExtensions,
    installExtension,
    uninstallExtension,
    reloadExtensions,
    getExtensionsDirectory,
    ensureExtensionsDirectory,
    validateManifest,
    getExtensionInfo,
    formatFileSize,
    scanExtensions
};