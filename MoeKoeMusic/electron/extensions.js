// 插件系统统一入口文件
import extensionManager from './extensionManager.js';
import { registerExtensionIPC, unregisterExtensionIPC } from './extensionIPC.js';
import log from 'electron-log';

/**
 * 初始化插件系统
 */
export function initializeExtensions() {
    try {
        // 确保插件目录存在
        extensionManager.ensureExtensionsDirectory();
        
        // 注册 IPC 处理程序
        registerExtensionIPC();
        
        // 加载插件
        extensionManager.loadChromeExtensions();
        
        return { success: true };
    } catch (error) {
        log.error('插件系统初始化失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 清理插件系统
 */
export function cleanupExtensions() {
    try {
        // 卸载所有插件
        extensionManager.unloadChromeExtensions();
        
        // 注销 IPC 处理程序
        unregisterExtensionIPC();
        
        return { success: true };
    } catch (error) {
        log.error('插件系统清理失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 重启插件系统
 */
export function restartExtensions() {
    try {
        const cleanupResult = cleanupExtensions();
        if (!cleanupResult.success) {
            return cleanupResult;
        }
        
        const initResult = initializeExtensions();
        return initResult;
    } catch (error) {
        log.error('重启插件系统失败:', error);
        return { success: false, error: error.message };
    }
}

export {
    extensionManager,
    registerExtensionIPC,
    unregisterExtensionIPC
};

export default {
    initializeExtensions,
    cleanupExtensions,
    restartExtensions,
    extensionManager,
    registerExtensionIPC,
    unregisterExtensionIPC
};