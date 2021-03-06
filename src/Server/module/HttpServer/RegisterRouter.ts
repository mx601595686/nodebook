import * as node_path from 'path';
import * as fs from 'fs-extra';
import * as koa_router from 'koa-router';
import * as koa_cache from 'koa-cache-control';
import * as moment from 'moment';
import * as ws from 'ws';
import * as node_pty from 'node-pty';
import * as request from 'request-promise-native';
import { ObservableVariable } from 'observable-variable';
import koa_conditional = require('koa-conditional-get');
import koa_etag = require('koa-etag');

import * as FilePath from '../../FilePath';

import { HttpServer } from './HttpServer';
import { UserManager } from '../UserManager/UserManager';
import { FileManager } from '../FileManager/FileManager';
import { MainProcessCommunicator } from '../MainProcess/MainProcessCommunicator';
import { SystemSetting } from '../SystemSetting/SystemSetting';
import { OpenSSLCertificate } from '../OpenSSLCertificate/OpenSSLCertificate';
import { MailService } from '../MailService/MailService';
import { BackupData } from '../BackupData/BackupData';
import { LibraryManager } from '../LibraryManager/LibraryManager';
import { LogManager } from '../TaskManager/LogManager/LogManager';
import { TaskManager } from '../TaskManager/TaskManager';
import { ServiceManager } from '../TaskManager/ServiceManager';

const encodeURI: (val: string) => string = require('encodeurl');

/**
 * 注册路由
 */
export function registerRouter(router_login: koa_router, router_no_login: koa_router, router_ws: koa_router, httpServer: HttpServer): void {
    Others(router_login, httpServer);
    Static(router_no_login);
    Logo(router_login, router_no_login);
    File(router_login, httpServer);
    User(router_login, router_no_login, httpServer);
    Setting(router_login, httpServer);
    Backup(router_login, httpServer);
    Library(router_login, httpServer);
    Task(router_login, router_ws, httpServer);
    Terminal(router_login, router_ws);

    router_no_login.redirect('/', '/static/index.html');
    router_no_login.redirect('/favicon.ico', '/logo/favicon.ico');
}

/**
 * 一些不好归类的方法
 */
function Others(router_login: koa_router, httpServer: HttpServer) {
    const _mainProcessCommunicator = httpServer.services.MainProcessCommunicator as MainProcessCommunicator;
    const _systemSetting = httpServer.services.SystemSetting as SystemSetting;
    const _openSSLCertificate = httpServer.services.OpenSSLCertificate as OpenSSLCertificate;
    const _mailService = httpServer.services.MailService as MailService;

    const _programName = _systemSetting.normalSettings.get('client.programName') as ObservableVariable<string>;
    const _userPassword = _systemSetting.secretSettings.get('user.password') as ObservableVariable<string>;

    const _prefix = '/others';

    /**
     * 重启服务器
     * @param password 用户密码
     */
    router_login.post(_prefix + '/restart', ctx => {
        if (_userPassword.value === ctx.request.body.password) {
            setTimeout(() => _mainProcessCommunicator.restart(), 1000);
            ctx.body = 'ok';
        } else
            throw new Error('用户密码错误');
    });

    /**
     * 向用户返回他自己的ip
     */
    router_login.get(_prefix + '/getIP', ctx => {
        ctx.body = ctx.ip;
    });

    /**
     * 重新生成openssl证书
     * @param password 用户密码
     */
    router_login.post(_prefix + '/regenerateCert', async (ctx) => {
        if (_userPassword.value === ctx.request.body.password) {
            await _openSSLCertificate.generateCert();
            ctx.body = 'ok';
        } else
            throw new Error('用户密码错误');
    });

    /**
     * 发送测试邮件，用于检测邮箱设置是否正确
     */
    router_login.get(_prefix + '/sendTestMail', async (ctx) => {
        await _mailService.sendMail(
            `${_programName.value} 测试邮件`,
            `时间:${moment().format('YYYY-MM-DD HH:mm:ss')}\nhost:${_mainProcessCommunicator.domain}`,
            [{ filename: 'logo.png', content: await fs.promises.readFile(FilePath._logoBrandPath) }]
        );
        ctx.body = 'ok';
    });
}

/**
 * 客户端静态文件发送
 */
function Static(router_no_login: koa_router) {
    router_no_login.get('/static/:path+',
        koa_conditional(),
        koa_etag(),
        koa_cache({ maxAge: 31536000 }),    //缓存一年
        async function StaticFileSender(ctx) {
            const path = node_path.join(FilePath._appClientFileDir, ctx.params.path);
            await FileManager._isFile(path);
            ctx.body = fs.createReadStream(path);
        }
    );
}

/**
 * 修改程序Logo
 */
function Logo(router_login: koa_router, router_no_login: koa_router) {
    const _prefix = '/logo';

    router_no_login.get(_prefix + '/:path(.+?\\..+)',
        koa_conditional(),
        koa_etag(),
        async function LogoFileSender(ctx) {
            const path = node_path.join(FilePath._logoDir, ctx.params.path);
            await FileManager._isFile(path);
            ctx.body = fs.createReadStream(path);
        }
    );

    /**
     * 修改程序图标
     * @param filename
     * @param file
     */
    router_login.post(_prefix + '/change', async (ctx) => {
        if (['brand.png', 'icon.png', 'favicon.ico'].includes(ctx.request.body.filename)) {
            if (ctx.request.files && ctx.request.files.file) {
                await fs.move(ctx.request.files.file.path, node_path.join(FilePath._logoDir, ctx.request.body.filename), { overwrite: true });
                ctx.body = 'ok';
            } else
                throw new Error('没有接收到要上传的文件');
        } else {
            throw new Error(`上传程序Logo文件名错误。[${ctx.request.body.filename}]`);
        }
    });

    /**
     * 重置
     */
    router_login.post(_prefix + '/reset', async (ctx) => {
        await fs.copy(node_path.join(FilePath._appClientFileDir, './res/img/logo'), FilePath._logoDir, { overwrite: true });
        ctx.body = 'ok';
    });
}

/**
 * 文件相关操作
 */
function File(router_login: koa_router, httpServer: HttpServer) {
    const _fileManager: FileManager = httpServer.services.FileManager;

    const _prefix_api = '/file/api';    //文件操作方法
    const _prefix_data = '/file/data';  //读取文件内容

    //#region 读取文件操作

    const router_etag = new koa_router().use(koa_conditional(), koa_etag());

    /**
     * 读取用户代码目录下的文件
     * @param path 相对于用户代码目录
     */
    router_etag.get(_prefix_data + '/code/:path+', async (ctx) => {
        ctx.body = await _fileManager.readFile(node_path.join(FilePath._userCodeDir, ctx.params.path));
    });

    /**
     * 读取用户程序数据目录下的文件
     * @param path
     */
    router_etag.get(_prefix_data + '/programData/:path+', async (ctx) => {
        ctx.body = await _fileManager.readFile(node_path.join(FilePath._programDataDir, ctx.params.path));
    });

    /**
     * 读取用户回收站目录下的文件
     * @param path 
     */
    router_etag.get(_prefix_data + '/recycle/:path+', async (ctx) => {
        ctx.body = await _fileManager.readFile(node_path.join(FilePath._recycleDir, ctx.params.path));
    });

    /**
     * 读取用户类库目录下的文件
     * @param path
     */
    router_etag.get(_prefix_data + '/library/:path+', async (ctx) => {
        ctx.body = await _fileManager.readFile(node_path.join(FilePath._libraryDir, ctx.params.path));
    });

    /**
     * 这个相当于上面那4个的汇总，上面的主要是方便用户使用，这个主要是方便程序内部使用
     * @param path 传入的路径需对应服务器端全路径
     * @param {boolean} download 是否让浏览器下载。默认false
     */
    router_etag.get(_prefix_api + '/readFile', async (ctx) => {
        ctx.body = await _fileManager.readFile(ctx.request.query.path);

        //确保浏览器会弹出下载框
        if (ctx.request.query.download === 'true')
            ctx.set('Content-Disposition', `attachment;filename*=UTF-8''${encodeURI(node_path.basename(ctx.body.path))}`);
    });

    router_login.use(router_etag.routes(), router_etag.allowedMethods());

    //#endregion

    /**
     * 压缩某个文件或目录，用于用户下载
     * @param path 传入的路径需对应服务器端全路径
     */
    router_login.get(_prefix_api + '/zipDownloadData', async (ctx: any) => {
        ctx.compress = false;   //确保不会被 koa-compress 压缩
        ctx.body = await _fileManager.zipDownloadData(ctx.request.query.path);
        ctx.set('Content-Disposition', `attachment;filename*=UTF-8''${encodeURI(node_path.basename(ctx.request.query.path))}.zip`);
    });

    /**
     * 查询某个单独的文件的状态信息
     * @param path 传入的路径需对应服务器端全路径
     */
    router_login.post(_prefix_api + '/fileStatus', async (ctx) => {
        ctx.body = await _fileManager.fileStatus(ctx.request.body.path);
    });

    /**
     * 列出某个目录中的子目录与文件
     * @param path 
     */
    router_login.post(_prefix_api + '/listDirectory', async (ctx) => {
        ctx.body = await _fileManager.listDirectory(ctx.request.body.path);
    });

    /**
     * 创建目录
     * @param path
     */
    router_login.post(_prefix_api + '/createDirectory', async (ctx) => {
        await _fileManager.createDirectory(ctx.request.body.path);
        ctx.body = 'ok';
    });

    /**
     * 复制文件或整个目录
     * @param from
     * @param to
     */
    router_login.post(_prefix_api + '/copy', async (ctx) => {
        await _fileManager.copy(ctx.request.body.from, ctx.request.body.to);
        ctx.body = 'ok';
    });

    /**
     * 移动文件或整个目录
     * @param from
     * @param to
     */
    router_login.post(_prefix_api + '/move', async (ctx) => {
        await _fileManager.move(ctx.request.body.from, ctx.request.body.to);
        ctx.body = 'ok';
    });

    /**
     * 上传文件，一次只允许上传一个文件
     * @param file
     * @param to 
     */
    router_login.post(_prefix_api + '/uploadFile', async (ctx) => {
        if (ctx.request.files && ctx.request.files.file) {
            await _fileManager.moveFromOutside(ctx.request.files.file.path, ctx.request.body.to);
            ctx.body = 'ok';
        } else
            throw new Error('没有接收到要上传的文件');
    });

    /**
     * 删除 '_userCodeDir' 下的文件或目录
     * @param path
     */
    router_login.post(_prefix_api + '/deleteCodeData', async (ctx) => {
        await _fileManager.deleteCodeData(ctx.request.body.path);
        ctx.body = 'ok';
    });

    /**
     * 永久删除 '_userCodeDir' 下的文件或目录
     * @param path
     */
    router_login.post(_prefix_api + '/deleteCodeDataDirectly', async (ctx) => {
        await _fileManager.deleteCodeDataDirectly(ctx.request.body.path);
        ctx.body = 'ok';
    });

    /**
     * 永久删除 '_programDataDir' 下的文件或目录
     * @param path
     */
    router_login.post(_prefix_api + '/deleteProgramData', async (ctx) => {
        await _fileManager.deleteProgramData(ctx.request.body.path);
        ctx.body = 'ok';
    });

    /**
     * 永久删除 '_recycleDir' 下的文件或目录
     * @param path
     */
    router_login.post(_prefix_api + '/deleteRecycleData', async (ctx) => {
        await _fileManager.deleteRecycleData(ctx.request.body.path);
        ctx.body = 'ok';
    });

    /**
     * 清空回收站
     */
    router_login.post(_prefix_api + '/cleanRecycle', async (ctx) => {
        await _fileManager.cleanRecycle();
        ctx.body = 'ok';
    });

    /**
     * 压缩某个文件或目录
     * @param path
     * @param to
     */
    router_login.post(_prefix_api + '/zipData', async (ctx: any) => {
        await _fileManager.zipData(ctx.request.body.path, ctx.request.body.to);
        ctx.body = 'ok';
    });

    /**
     * 解压压缩文件
     * @param path
     * @param to
     */
    router_login.post(_prefix_api + '/unzipData', async (ctx: any) => {
        await _fileManager.unzipData(ctx.request.body.path, ctx.request.body.to);
        ctx.body = 'ok';
    });
}

/**
 * 用户相关操作
 */
function User(router_login: koa_router, router_no_login: koa_router, httpServer: HttpServer) {
    const _userManager: UserManager = httpServer.services.UserManager;
    const _prefix = '/user';

    /**
     * 用户登录。
     * @param name 用户名
     * @param pass 登录密码，注意客户端在传递密码之前需要进行MD5操作
     */
    router_no_login.post(_prefix + '/login', ctx => {
        const token = _userManager.login(ctx.request.body.name, ctx.request.body.pass, ctx.ip);
        ctx.cookies.set('nodebook_token', token);
        ctx.body = 'ok';
    });

    /**
     * 用户更新自己的令牌
     */
    router_login.get(_prefix + '/update_token', ctx => {
        const token = _userManager.updateToken();
        ctx.cookies.set('nodebook_token', token);
        ctx.body = 'ok';
    });
}

/**
 * 系统变量设置
 */
function Setting(router_login: koa_router, httpServer: HttpServer) {
    const _systemSetting = httpServer.services.SystemSetting as SystemSetting;
    const _prefix = '/setting';

    /**
     * 获取所有普通设置
     */
    router_login.get(_prefix + '/getAllNormalKey', ctx => {
        ctx.body = _systemSetting.getAllNormalKey();
    });

    /**
     * 获取所有私密设置。除了密码
     */
    router_login.get(_prefix + '/getAllSecretKey', ctx => {
        ctx.body = _systemSetting.getAllSecretKey();
    });

    /**
     * 更改系统普通设置
     * @param key
     * @param value
     */
    router_login.post(_prefix + '/changeNormalSetting', ctx => {
        _systemSetting.changeNormalSetting(ctx.request.body.key, ctx.request.body.value);
        ctx.body = 'ok';
    });

    /**
     * 更改系统私密设置
     * @param key
     * @param value
     * @param password
     */
    router_login.post(_prefix + '/changeSecretSetting', ctx => {
        _systemSetting.changeSecretSetting(ctx.request.body.key, ctx.request.body.value, ctx.request.body.password);
        ctx.body = 'ok';
    });
}

/**
 * 用户数据备份
 */
function Backup(router_login: koa_router, httpServer: HttpServer) {
    const _backupData = httpServer.services.BackupData as BackupData;
    const _prefix = '/backup';

    /**
     * 下载某个备份文件。
     * @param filename
     */
    router_login.get(_prefix + '/readBackupFile', async (ctx: any) => {
        ctx.compress = false;   //确保不会被 koa-compress 压缩
        ctx.body = await _backupData.readBackupFile(ctx.request.query.filename);
        ctx.set('Content-Disposition', `attachment;filename*=UTF-8''${ctx.request.query.filename}`);
    });

    /**
     * 将某个备份文件发送到用户邮箱
     * @param filename
     */
    router_login.post(_prefix + '/sendBackupEmail', async (ctx) => {
        await _backupData.sendBackupEmail(ctx.request.body.filename);
        ctx.body = 'ok';
    });

    /**
     * 列出所有备份文件的文件名
     */
    router_login.get(_prefix + '/listBackupFiles', async (ctx) => {
        ctx.body = await _backupData.listBackupFiles();
    });

    /**
     * 删除某个备份文件
     * @param filename
     */
    router_login.post(_prefix + '/deleteBackupFiles', async (ctx) => {
        await _backupData.deleteBackupFiles(ctx.request.body.filename);
        ctx.body = 'ok';
    });

    /**
     * 创建一个新的备份
     */
    router_login.get(_prefix + '/createBackupFile', async (ctx) => {
        ctx.body = await _backupData.createBackupFile();
    });

    /**
     * 从备份文件中恢复数据
     * @param filename
     * @param password
     */
    router_login.post(_prefix + '/resumeFromBackup', ctx => {
        _backupData.resumeFromBackup(ctx.request.body.filename, ctx.request.body.password);
        ctx.body = 'ok';
    });
}

/**
 * 程序类库管理
 */
function Library(router_login: koa_router, httpServer: HttpServer) {
    const _libraryManager = httpServer.services.LibraryManager as LibraryManager;
    const _prefix = '/library';

    /**
     * 获取安装了的类库列表
     */
    router_login.get(_prefix + '/getInstalledLibraries', async (ctx) => {
        ctx.body = await _libraryManager.getInstalledLibraries();
    });

    /**
     * 安装类库
     * @param name
     */
    router_login.post(_prefix + '/installLibrary', async (ctx) => {
        await _libraryManager.installLibrary(ctx.request.body.name);
        ctx.body = 'ok';
    });

    /**
     * 卸载类库
     * @param name
     */
    router_login.post(_prefix + '/uninstallLibrary', async (ctx) => {
        await _libraryManager.uninstallLibrary(ctx.request.body.name);
        ctx.body = 'ok';
    });

    /**
     * 更新某个类库
     * @param name
     */
    router_login.post(_prefix + '/updateLibrary', async (ctx) => {
        await _libraryManager.updateLibrary(ctx.request.body.name);
        ctx.body = 'ok';
    });
}

/**
 * 用户任务管理
 */
function Task(router_login: koa_router, router_ws: koa_router, httpServer: HttpServer) {
    const _logManager = httpServer.services.LogManager as LogManager;
    const _taskManager = httpServer.services.TaskManager as TaskManager;
    const _serviceManager = httpServer.services.ServiceManager as ServiceManager;

    const _prefix = '/task';

    //#region LogManager

    /**
     * 清空某个任务的日志
     * @param path
     */
    router_login.post(_prefix + '/cleanTaskLogger', ctx => {
        _logManager.cleanTaskLogger(ctx.request.body.path);
        ctx.body = 'ok';
    });

    /**
     * 获取某个任务在某个时间点之后的所有日志
     * @param path
     * @param date 数字形式
     */
    router_login.post(_prefix + '/getLogsAfterDate', ctx => {
        ctx.body = _logManager.getLogsAfterDate(
            ctx.request.body.path,
            ctx.request.body.date ? Number.parseInt(ctx.request.body.date) : undefined
        );
    });

    /**
     * 从末尾获取多少条日志
     * @param path
     * @param size 数字形式
     */
    router_login.post(_prefix + '/getLogsFromEnd', ctx => {
        ctx.body = _logManager.getLogsFromEnd(ctx.request.body.path, Number.parseInt(ctx.request.body.size));
    });

    /**
     * 获取某个任务当前的运行状态
     * @param path
     */
    router_login.post(_prefix + '/getTaskStatus', ctx => {
        ctx.body = _logManager.getTaskStatus(ctx.request.body.path);
    });

    /**
     * 获取所有任务的状态
     */
    router_login.get(_prefix + '/getAllTaskStatus', ctx => {
        ctx.body = _logManager.getAllTaskStatus();
    });

    //#endregion

    //#region TaskManager

    /**
     * 创建一个新的任务
     * @param path
     * @param {boolean} debug 是否开启调试
     */
    router_login.post(_prefix + '/createTask', async (ctx) => {
        ctx.body = await _taskManager.createTask(ctx.request.body.path, ctx.request.body.debug === 'true');
    });

    /**
     * 终止某个正在运行的任务
     * @param path
     */
    router_login.post(_prefix + '/destroyTask', ctx => {
        _taskManager.destroyTask(ctx.request.body.path);
        ctx.body = 'ok';
    });

    /**
     * 获取某个正在运行的任务，资源消耗的情况
     * @param path
     */
    router_login.post(_prefix + '/getTaskResourcesConsumption', async (ctx) => {
        ctx.body = await _taskManager.getTaskResourcesConsumption(ctx.request.body.path);
    });

    /**
     * 获取计算机的硬件信息
     */
    router_login.get(_prefix + '/getSystemHardwareInfo', async (ctx) => {
        ctx.body = await _taskManager.getSystemHardwareInfo();
    });

    /**
     * 调用任务中暴露出的方法
     * @param path
     * @param function
     * @param json
     */
    router_login.post(_prefix + '/invokeTaskFunction', async (ctx) => {
        ctx.body = await _taskManager.invokeTaskFunction(
            ctx.request.body.path,
            ctx.request.body.function,
            ctx.request.body.json
        );
    });

    /**
     * 调试代理
     * @param port createTask发送给客户端的调试端口号
     */
    router_ws.get(_prefix + '/debugProxy', async (ctx) => {
        //获取调试元数据
        const metadata = (await request(`http://127.0.0.1:${ctx.request.query.port}/json/list`, { json: true }))[0];

        ctx.handleWs((client: ws) => {
            const inspector = new ws(metadata.webSocketDebuggerUrl);

            inspector.on('close', () => client.close());
            inspector.on('error', () => client.close());
            inspector.on('message', data => {
                if (client.readyState === ws.OPEN)
                    client.send(data);
            });

            client.on('close', () => inspector.close());
            client.on('message', data => {
                if (inspector.readyState === ws.OPEN)
                    inspector.send(data);
            });
        });
    });

    //#endregion

    //#region ServiceManager

    /**
     * 获取服务列表
     */
    router_login.get(_prefix + '/getServicesList', ctx => {
        ctx.body = _serviceManager.getServicesList();
    });

    /**
     * 创建一个新的服务
     * @param path
     * @param name
     * @param auto_restart
     * @param report_error
     */
    router_login.post(_prefix + '/createService', async (ctx) => {
        await _serviceManager.createService(
            ctx.request.body.path,
            ctx.request.body.name,
            ctx.request.body.auto_restart == 'true',
            ctx.request.body.report_error == 'true',
        );
        ctx.body = 'ok';
    });

    /**
     * 更新某个服务的配置
     * @param path
     * @param name
     * @param auto_restart
     * @param report_error
     */
    router_login.post(_prefix + '/updateService', async (ctx) => {
        await _serviceManager.updateService(
            ctx.request.body.path,
            ctx.request.body.name,
            ctx.request.body.auto_restart == 'true',
            ctx.request.body.report_error == 'true',
        );
        ctx.body = 'ok';
    });

    /**
     * 删除某个服务
     * @param path
     */
    router_login.post(_prefix + '/deleteService', async (ctx) => {
        await _serviceManager.deleteService(ctx.request.body.path);
        ctx.body = 'ok';
    });

    //#endregion
}

/**
 * websocket终端
 */
function Terminal(router_login: koa_router, router_ws: koa_router) {
    const _prefix = '/terminal';
    const _terminalList = new Map<string, node_pty.IPty>();

    /**
     * 改变某个终端的视图大小
     * @param id 终端的唯一随机编号
     * @param columns 终端的列宽
     * @param rows 终端的行高
     */
    router_login.post(_prefix + '/resize', ctx => {
        const terminal = _terminalList.get(ctx.request.body.id);

        if (terminal) {
            const columns = +ctx.request.body.columns;
            const rows = +ctx.request.body.rows;

            if (Number.isSafeInteger(columns) && Number.isSafeInteger(rows))
                terminal.resize(columns, rows);
            else
                throw new Error('`columns`或`rows`的数据类型不正确');
        }

        ctx.body = 'ok';
    });
    
    /**
     * 打开新的终端
     * @param id 终端的唯一随机编号
     */
    router_ws.get(_prefix + '/open', ctx => {
        const id = ctx.request.query.id;

        ctx.handleWs((client: ws) => {
            const terminal = node_pty.spawn('bash', [], { cwd: '/', cols: 120, rows: 30 });

            terminal.on('exit', () => {
                client.close();
                _terminalList.delete(id);
            });
            terminal.on('data', data => {
                if (client.readyState === ws.OPEN)
                    client.send(data)
            });

            client.once('close', () => terminal.kill());
            client.on('message', data => terminal.write(data.toString()));

            _terminalList.set(id, terminal);
        });
    });
}